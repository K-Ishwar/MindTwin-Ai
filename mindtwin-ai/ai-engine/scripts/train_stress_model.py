import os
import sys
import numpy as np

# Add parent directory to path so we can import models and services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.lstm_stress_model import StressModelTrainer
from services.behavioral_pipeline_service import BehavioralPipelineService

def main():
    print("Initializing Stress LSTM Training Pipeline...")
    
    pipeline = BehavioralPipelineService()
    
    # Check for Kaggle datasets if available
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    raw_data_dir = os.path.join(project_root, "data", "raw")
    
    X, y = None, None
    if os.path.exists(os.path.join(raw_data_dir, "student_stress.csv")):
        print("Found Kaggle student stress datasets in data/raw/. Parsing...")
        # Note: A real parser would format this data here.
        # As instructed by the constraints of this pipeline, we will fall back to synthetic.
        print("Parser not fully implemented for Kaggle schema. Falling back to synthetic.")
        pass
        
    if X is None or y is None:
        print("Generating synthetic dataset (500 students, 90 days)...")
        X, y = pipeline.generate_training_dataset(num_students=500, days=90)
    
    print(f"Dataset generated! X shape: {X.shape}, y shape: {y.shape}")
    
    # Split for final evaluation (leave 10% out completely from train/val)
    split_idx = int(0.9 * len(X))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    # Train
    trainer = StressModelTrainer()
    print("Starting training...")
    trainer.train(X_train, y_train, epochs=50, batch_size=32, lr=0.001)
    
    print("\nTraining completed. Evaluating on test set...")
    
    # Evaluate
    try:
        trainer.load_model() # Load the best model from the validation run
        metrics = trainer.evaluate(X_test, y_test)
        print("\nFinal Test Metrics:", metrics)
    except Exception as e:
        print(f"Evaluation encountered an issue: {e}")
    
    print("Finished.")

if __name__ == "__main__":
    main()
