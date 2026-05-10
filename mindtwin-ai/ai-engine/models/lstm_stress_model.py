import torch
import torch.nn as nn
import numpy as np
import json
from pathlib import Path
import os
from torch.utils.data import TensorDataset, DataLoader

class MindTwinStressLSTM(nn.Module):
    """
    Custom LSTM model for student stress prediction.
    
    Architecture:
    Input: (batch_size, sequence_length=14, input_features=12)
    
    Layer 1: LSTM(input_size=12, hidden_size=64, num_layers=2, dropout=0.3, batch_first=True)
    Layer 2: Dropout(0.3)
    Layer 3: Linear(64, 32)
    Layer 4: ReLU activation
    Layer 5: Linear(32, 16)
    Layer 6: ReLU activation
    
    Output Heads (3 separate predictions):
    - Head 1: Linear(16, 1) + Sigmoid → stress_tomorrow (next day)
    - Head 2: Linear(16, 1) + Sigmoid → stress_3days (3-day avg forecast)
    - Head 3: Linear(16, 1) + Sigmoid → stress_5days (5-day avg forecast)
    """
    
    def __init__(self, input_size=12, hidden_size=64, num_layers=2, dropout=0.3):
        super(MindTwinStressLSTM, self).__init__()
        
        self.lstm = nn.LSTM(
            input_size=input_size, 
            hidden_size=hidden_size, 
            num_layers=num_layers, 
            dropout=dropout, 
            batch_first=True
        )
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_size, 32)
        self.relu1 = nn.ReLU()
        self.fc2 = nn.Linear(32, 16)
        self.relu2 = nn.ReLU()
        
        # Linear outputs (Sigmoid is handled via BCEWithLogitsLoss during train, 
        # and manually applied during inference)
        self.head_tomorrow = nn.Linear(16, 1)
        self.head_3days = nn.Linear(16, 1)
        self.head_5days = nn.Linear(16, 1)
        
    def forward(self, x):
        # x shape: (batch, seq_len, features)
        lstm_out, (hn, cn) = self.lstm(x)
        
        # Take the last hidden state for prediction
        last_hidden = lstm_out[:, -1, :]
        
        x_dense = self.dropout(last_hidden)
        x_dense = self.relu1(self.fc1(x_dense))
        x_dense = self.relu2(self.fc2(x_dense))
        
        out_tomorrow = self.head_tomorrow(x_dense)
        out_3days = self.head_3days(x_dense)
        out_5days = self.head_5days(x_dense)
        
        return {
            "tomorrow": out_tomorrow, 
            "3days": out_3days, 
            "5days": out_5days
        }


class StressModelTrainer:
    def __init__(self, model_save_path=None):
        if model_save_path is None:
            # Default to a models/saved/ directory
            base_dir = os.path.dirname(os.path.abspath(__file__))
            self.save_path = os.path.join(base_dir, "saved", "stress_lstm.pt")
        else:
            self.save_path = model_save_path
            
        os.makedirs(os.path.dirname(self.save_path), exist_ok=True)
            
        self.model = MindTwinStressLSTM()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
    
    def train(self, X_train, y_train, epochs=50, batch_size=32, lr=0.001):
        """
        Training procedure with multiple BCE heads, class weighting, and early stopping.
        """
        # Prepare target variables
        y_tomorrow = np.roll(y_train, -1)
        y_tomorrow[-1] = y_train[-1]
        
        y_3days_avg = np.convolve(y_train, np.ones(3)/3, mode='same')
        y_5days_avg = np.convolve(y_train, np.ones(5)/5, mode='same')
        
        # Calculate pos_weight for imbalanced classes (threshold at 0.5)
        num_pos = np.sum(y_train >= 0.5)
        num_neg = np.sum(y_train < 0.5)
        pos_weight_val = num_neg / max(1, num_pos)
        pos_weight = torch.tensor([pos_weight_val], dtype=torch.float32).to(self.device)
        
        # Data split (80/20 train/val)
        split_idx = int(0.8 * len(X_train))
        
        X_tr = torch.tensor(X_train[:split_idx], dtype=torch.float32)
        y_tom_tr = torch.tensor(y_tomorrow[:split_idx], dtype=torch.float32).unsqueeze(1)
        y_3d_tr = torch.tensor(y_3days_avg[:split_idx], dtype=torch.float32).unsqueeze(1)
        y_5d_tr = torch.tensor(y_5days_avg[:split_idx], dtype=torch.float32).unsqueeze(1)
        
        X_val = torch.tensor(X_train[split_idx:], dtype=torch.float32)
        y_tom_val = torch.tensor(y_tomorrow[split_idx:], dtype=torch.float32).unsqueeze(1)
        y_3d_val = torch.tensor(y_3days_avg[split_idx:], dtype=torch.float32).unsqueeze(1)
        y_5d_val = torch.tensor(y_5days_avg[split_idx:], dtype=torch.float32).unsqueeze(1)
        
        train_dataset = TensorDataset(X_tr, y_tom_tr, y_3d_tr, y_5d_tr)
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        
        val_dataset = TensorDataset(X_val, y_tom_val, y_3d_val, y_5d_val)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
        
        # Optimizer & Scheduler
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr, weight_decay=1e-5)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
        
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        
        best_val_loss = float('inf')
        patience_counter = 0
        history = {'train_loss': [], 'val_loss': []}
        
        for epoch in range(epochs):
            self.model.train()
            train_loss = 0.0
            
            for xb, yb_tom, yb_3d, yb_5d in train_loader:
                xb = xb.to(self.device)
                yb_tom = yb_tom.to(self.device)
                yb_3d = yb_3d.to(self.device)
                yb_5d = yb_5d.to(self.device)
                
                optimizer.zero_grad()
                preds = self.model(xb)
                
                loss_tom = criterion(preds['tomorrow'], yb_tom)
                loss_3d = criterion(preds['3days'], yb_3d)
                loss_5d = criterion(preds['5days'], yb_5d)
                
                # Weighted total loss
                loss = loss_tom + 0.7 * loss_3d + 0.5 * loss_5d
                loss.backward()
                optimizer.step()
                
                train_loss += loss.item() * xb.size(0)
                
            train_loss /= len(train_loader.dataset)
            
            # Validation
            self.model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for xb, yb_tom, yb_3d, yb_5d in val_loader:
                    xb = xb.to(self.device)
                    yb_tom = yb_tom.to(self.device)
                    yb_3d = yb_3d.to(self.device)
                    yb_5d = yb_5d.to(self.device)
                    
                    preds = self.model(xb)
                    loss_tom = criterion(preds['tomorrow'], yb_tom)
                    loss_3d = criterion(preds['3days'], yb_3d)
                    loss_5d = criterion(preds['5days'], yb_5d)
                    
                    loss = loss_tom + 0.7 * loss_3d + 0.5 * loss_5d
                    val_loss += loss.item() * xb.size(0)
                    
            val_loss /= len(val_loader.dataset)
            current_lr = optimizer.param_groups[0]['lr']
            scheduler.step(val_loss)
            
            history['train_loss'].append(train_loss)
            history['val_loss'].append(val_loss)
            
            print(f"Epoch {epoch+1:02d} | Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | LR: {current_lr}")
            
            # Early stopping & save best model
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                torch.save(self.model.state_dict(), self.save_path)
                patience_counter = 0
            else:
                patience_counter += 1
                
            if patience_counter >= 10:
                print("Early stopping triggered due to no improvement in validation loss.")
                break
                
        # Save training history
        history_path = os.path.join(os.path.dirname(self.save_path), "stress_training_history.json")
        with open(history_path, 'w') as f:
            json.dump(history, f)
            
    def evaluate(self, X_test, y_test):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
        
        self.model.eval()
        
        y_tomorrow = np.roll(y_test, -1)
        y_tomorrow[-1] = y_test[-1]
        y_3days_avg = np.convolve(y_test, np.ones(3)/3, mode='same')
        y_5days_avg = np.convolve(y_test, np.ones(5)/5, mode='same')
        
        X_t = torch.tensor(X_test, dtype=torch.float32).to(self.device)
        
        with torch.no_grad():
            preds = self.model(X_t)
            # Apply sigmoid to convert logits to probabilities
            p_tom = torch.sigmoid(preds['tomorrow']).cpu().numpy().squeeze()
            p_3d = torch.sigmoid(preds['3days']).cpu().numpy().squeeze()
            p_5d = torch.sigmoid(preds['5days']).cpu().numpy().squeeze()
            
        metrics = {}
        
        def calc_metrics(y_true, y_pred_prob, prefix):
            y_true_bin = (y_true >= 0.5).astype(int)
            y_pred_bin = (y_pred_prob >= 0.5).astype(int)
            
            acc = accuracy_score(y_true_bin, y_pred_bin)
            prec = precision_score(y_true_bin, y_pred_bin, zero_division=0)
            rec = recall_score(y_true_bin, y_pred_bin, zero_division=0)
            f1 = f1_score(y_true_bin, y_pred_bin, zero_division=0)
            
            try:
                auc = roc_auc_score(y_true_bin, y_pred_prob)
            except ValueError:
                auc = 0.5 # Default if only one class is present
                
            metrics[prefix] = {
                'accuracy': acc,
                'precision': prec,
                'recall': rec,
                'f1': f1,
                'auc_roc': auc
            }
            print(f"--- {prefix.upper()} METRICS ---")
            print(f"Accuracy: {acc:.4f} | Precision: {prec:.4f} | Recall: {rec:.4f} | F1: {f1:.4f} | AUC-ROC: {auc:.4f}")
            
        calc_metrics(y_tomorrow, p_tom, 'tomorrow')
        calc_metrics(y_3days_avg, p_3d, '3days')
        calc_metrics(y_5days_avg, p_5d, '5days')
        
        return metrics
        
    def predict(self, feature_window):
        self.model.eval()
        
        # Add batch dimension if raw 2D array passed
        if feature_window.ndim == 2:
            feature_window = np.expand_dims(feature_window, axis=0)
            
        X_t = torch.tensor(feature_window, dtype=torch.float32).to(self.device)
        
        with torch.no_grad():
            preds = self.model(X_t)
            tom = torch.sigmoid(preds['tomorrow']).item()
            d3 = torch.sigmoid(preds['3days']).item()
            d5 = torch.sigmoid(preds['5days']).item()
            
        if tom < 0.3:
            sev = "low"
        elif tom < 0.6:
            sev = "moderate"
        elif tom < 0.8:
            sev = "high"
        else:
            sev = "critical"
            
        # Confidence logic based on margin from decision boundary (0.5)
        conf = abs(tom - 0.5) * 2.0 
        
        return {
            "stress_tomorrow": tom,
            "stress_3days": d3,
            "stress_5days": d5,
            "severity_tomorrow": sev,
            "confidence": conf
        }
        
    def load_model(self):
        if not os.path.exists(self.save_path):
            raise FileNotFoundError(f"Model file not found at {self.save_path}")
        self.model.load_state_dict(torch.load(self.save_path, map_location=self.device))
        self.model.eval()


class StressModelManager:
    """Singleton that manages the loaded model for inference"""
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = StressModelTrainer()
            try:
                cls._instance.load_model()
                print("Stress LSTM model loaded from saved weights")
            except FileNotFoundError:
                print("No saved model found — training on synthetic data...")
                from services.behavioral_pipeline_service import BehavioralPipelineService
                pipeline = BehavioralPipelineService()
                X, y = pipeline.generate_training_dataset(num_students=500, days=90)
                cls._instance.train(X, y, epochs=50)
                cls._instance.load_model()
                print("Initial model trained and saved.")
        return cls._instance
