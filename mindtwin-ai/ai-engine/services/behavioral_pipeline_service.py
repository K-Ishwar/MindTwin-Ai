import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import psycopg2
import pymongo
import os

class BehavioralPipelineService:
    
    def extract_daily_features(self, student_id: str, date: str) -> dict:
        """
        Extracts 12 behavioral features for a student on a given date.
        These 12 features are the LSTM input dimensions.
        
        Features (in exact order — order matters for LSTM):
        [0]  study_hours: Total actual study hours that day (from study_sessions)
        [1]  sessions_count: Number of study sessions (completed + skipped)
        [2]  avg_quiz_score: Average quiz score that day (0 if no quiz)
        [3]  quiz_attempts: Number of quizzes taken
        [4]  mood_score: Average mood from mood_logs (0 if not logged → impute with 3.0)
        [5]  social_media_mins: Total social media usage minutes (from social_media_sessions)
        [6]  sleep_hours_estimate: Estimated from session start/end times
        [7]  days_to_next_exam: Days until student's nearest upcoming exam
        [8]  topics_completed_ratio: completed sessions / planned sessions (0 if no plan)
        [9]  break_frequency: avg number of pomodoro breaks per session
        [10] late_night_sessions: 1 if any session started after 11pm, else 0
        [11] focus_tokens_earned: total tokens earned that day
        """
        # In a real scenario, this would query PostgreSQL and MongoDB using the credentials.
        # For phase 5 pipeline demonstration, we return a fallback synthetic vector if DB isn't reachable.
        
        features = [0.0] * 12
        features[4] = 3.0 # default mood
        features[6] = 7.0 # default sleep
        
        try:
            # Pseudo-connection code placeholder
            # pg_conn = psycopg2.connect(os.getenv("DATABASE_URL"))
            # mongo_client = pymongo.MongoClient(os.getenv("MONGO_URI"))
            pass
        except Exception as e:
            pass
            
        return {
            "date": date,
            "student_id": student_id,
            "feature_vector": features,
            "has_data": False
        }
    
    def extract_window(self, student_id: str, end_date: str, window_days: int = 14) -> np.ndarray:
        """
        Extracts a window of daily feature vectors for LSTM input.
        Returns: numpy array of shape (window_days, 12)
        Normalizes all features to [0, 1] range using fixed bounds.
        """
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        
        raw_window = []
        for i in range(window_days - 1, -1, -1):
            target_dt = end_dt - timedelta(days=i)
            day_data = self.extract_daily_features(student_id, target_dt.strftime("%Y-%m-%d"))
            raw_window.append(day_data["feature_vector"])
            
        raw_window = np.array(raw_window, dtype=np.float32) # (window_days, 12)
        
        # Normalize
        bounds = [
            (0, 12),    # study_hours
            (0, 8),     # sessions_count
            (0, 100),   # avg_quiz_score
            (0, 5),     # quiz_attempts
            (1, 5),     # mood_score
            (0, 300),   # social_media_mins
            (3, 10),    # sleep_hours_estimate
            (0, 60),    # days_to_next_exam
            (0, 1),     # topics_completed_ratio
            (0, 5),     # break_frequency
            (0, 1),     # late_night_sessions
            (0, 50)     # focus_tokens_earned
        ]
        
        norm_window = np.zeros_like(raw_window)
        for i, (min_val, max_val) in enumerate(bounds):
            val = raw_window[:, i]
            if i == 7: # cap days_to_next_exam at 60
                val = np.clip(val, 0, 60)
            
            norm_val = (val - min_val) / (max_val - min_val)
            norm_window[:, i] = np.clip(norm_val, 0.0, 1.0)
            
        return norm_window
    
    def compute_stress_label(self, feature_vector: dict) -> float:
        """
        Rule-based stress label computer for training data generation.
        Returns: float stress score [0.0, 1.0]
        """
        vec = feature_vector["feature_vector"] if "feature_vector" in feature_vector else feature_vector
        
        study_hours = vec[0]
        quiz_attempts = vec[3]
        mood_score = vec[4]
        social_media_mins = vec[5]
        days_to_exam = vec[7]
        topics_completed_ratio = vec[8]
        late_night_sessions = vec[10]
        focus_tokens_earned = vec[11]
        
        score = 0.2  # Baseline stress
        
        # High stress signals
        if days_to_exam <= 3:
            score += 0.35
        elif days_to_exam <= 7:
            score += 0.20
            
        if mood_score <= 2:
            score += 0.25
        elif mood_score <= 3:
            score += 0.15
            
        if late_night_sessions == 1:
            score += 0.15
            
        if study_hours > 8:
            score += 0.10
            
        if topics_completed_ratio < 0.3:
            score += 0.15
            
        if social_media_mins > 180:
            score += 0.10
            
        if quiz_attempts == 0 and days_to_exam <= 7:
            score += 0.10
            
        # Low stress signals
        if mood_score >= 4:
            score -= 0.15
            
        if topics_completed_ratio >= 0.8:
            score -= 0.10
            
        if 3 <= study_hours <= 6:
            score -= 0.05
            
        if focus_tokens_earned >= 20:
            score -= 0.05
            
        return max(0.0, min(1.0, score))
    
    def generate_training_dataset(self, num_students: int = 500, days: int = 90) -> tuple:
        """
        Generates synthetic training data for the LSTM.
        Simulates 4 student archetypes.
        Returns: (X_train, y_train)
        """
        np.random.seed(42)
        X_seqs = []
        y_labels = []
        
        # Calculate archetype distributions
        num_arch1 = int(num_students * 0.25)
        num_arch2 = int(num_students * 0.30)
        num_arch3 = int(num_students * 0.25)
        num_arch4 = num_students - num_arch1 - num_arch2 - num_arch3
        
        archetypes = ([1] * num_arch1) + ([2] * num_arch2) + ([3] * num_arch3) + ([4] * num_arch4)
        np.random.shuffle(archetypes)
        
        for student_idx, arch in enumerate(archetypes):
            student_features = []
            
            # Exam cycle simulation (e.g. an exam every 30 days)
            exam_days = [30, 60, 90]
            
            for day in range(1, days + 1):
                # Find days to next exam
                next_exam = min([e for e in exam_days if e >= day], default=120)
                days_to_exam = next_exam - day
                
                # Base features
                study_hours = 0.0
                sessions_count = 0
                avg_quiz_score = 0.0
                quiz_attempts = 0
                mood_score = 3.0
                social_media_mins = 60.0
                sleep_hours_estimate = 7.0
                topics_completed_ratio = 0.0
                break_frequency = 0.0
                late_night_sessions = 0
                focus_tokens_earned = 0.0
                
                # Archetype logic
                if arch == 1: # Consistent Performer
                    study_hours = np.clip(np.random.normal(5, 1), 3, 8)
                    sessions_count = int(np.clip(np.random.normal(4, 1), 2, 6))
                    mood_score = np.clip(np.random.normal(4, 0.5), 3, 5)
                    topics_completed_ratio = np.clip(np.random.normal(0.8, 0.1), 0.6, 1.0)
                    avg_quiz_score = np.clip(np.random.normal(85, 10), 60, 100)
                    quiz_attempts = np.random.choice([0, 1, 2], p=[0.5, 0.3, 0.2])
                    social_media_mins = np.clip(np.random.normal(45, 20), 0, 120)
                    sleep_hours_estimate = np.clip(np.random.normal(7.5, 0.5), 6, 9)
                    focus_tokens_earned = study_hours * 5
                    
                elif arch == 2: # Procrastinator
                    if days_to_exam > 7:
                        study_hours = np.clip(np.random.normal(1, 1), 0, 3)
                        sessions_count = int(np.clip(np.random.normal(1, 1), 0, 3))
                        mood_score = np.clip(np.random.normal(3.5, 0.5), 2, 5)
                        social_media_mins = np.clip(np.random.normal(150, 40), 60, 300)
                        sleep_hours_estimate = np.clip(np.random.normal(7.5, 1), 5, 9)
                    else:
                        study_hours = np.clip(np.random.normal(9, 1.5), 6, 12)
                        sessions_count = int(np.clip(np.random.normal(6, 1), 4, 8))
                        mood_score = np.clip(np.random.normal(2, 0.5), 1, 3)
                        social_media_mins = np.clip(np.random.normal(30, 20), 0, 60)
                        sleep_hours_estimate = np.clip(np.random.normal(5, 1), 3, 7)
                        late_night_sessions = 1 if np.random.rand() > 0.3 else 0
                        
                    topics_completed_ratio = np.clip(study_hours / 10.0, 0, 1)
                    avg_quiz_score = np.clip(np.random.normal(70, 15), 40, 90)
                    quiz_attempts = 1 if days_to_exam <= 3 else 0
                    focus_tokens_earned = study_hours * 3
                    
                elif arch == 3: # Burnout Risk
                    # Starts strong, declines
                    decline_factor = day / days
                    study_hours = np.clip(np.random.normal(8 - (decline_factor * 4), 1), 2, 10)
                    sessions_count = int(np.clip(np.random.normal(5 - (decline_factor * 2), 1), 1, 7))
                    mood_score = np.clip(np.random.normal(4 - (decline_factor * 2), 0.5), 1, 5)
                    sleep_hours_estimate = np.clip(np.random.normal(7 - (decline_factor * 2), 0.5), 4, 8)
                    late_night_sessions = 1 if np.random.rand() < decline_factor else 0
                    topics_completed_ratio = np.clip(np.random.normal(0.8 - (decline_factor * 0.4), 0.1), 0.2, 1.0)
                    social_media_mins = np.clip(np.random.normal(60 + (decline_factor * 100), 30), 30, 240)
                    avg_quiz_score = np.clip(np.random.normal(80 - (decline_factor * 20), 10), 40, 90)
                    quiz_attempts = np.random.choice([0, 1])
                    focus_tokens_earned = study_hours * 4
                    
                elif arch == 4: # Struggling Starter
                    study_hours = np.clip(np.random.normal(2, 1), 0, 4)
                    sessions_count = int(np.clip(np.random.normal(2, 1), 0, 4))
                    mood_score = np.clip(np.random.normal(2.5, 0.5), 1, 4)
                    topics_completed_ratio = np.clip(np.random.normal(0.4, 0.2), 0.1, 0.7)
                    avg_quiz_score = np.clip(np.random.normal(55, 15), 30, 80)
                    quiz_attempts = np.random.choice([0, 1], p=[0.7, 0.3])
                    social_media_mins = np.clip(np.random.normal(180, 50), 100, 300)
                    sleep_hours_estimate = np.clip(np.random.normal(6.5, 1.5), 4, 9)
                    focus_tokens_earned = study_hours * 2
                
                # Assemble feature vector
                vec = [
                    float(study_hours),
                    float(sessions_count),
                    float(avg_quiz_score),
                    float(quiz_attempts),
                    float(mood_score),
                    float(social_media_mins),
                    float(sleep_hours_estimate),
                    float(days_to_exam),
                    float(topics_completed_ratio),
                    float(break_frequency),
                    float(late_night_sessions),
                    float(focus_tokens_earned)
                ]
                
                student_features.append(vec)
                
            student_features = np.array(student_features)
            
            # Normalize sequence
            bounds = [
                (0, 12), (0, 8), (0, 100), (0, 5), (1, 5), (0, 300), 
                (3, 10), (0, 60), (0, 1), (0, 5), (0, 1), (0, 50)
            ]
            
            norm_features = np.zeros_like(student_features)
            for i, (min_val, max_val) in enumerate(bounds):
                val = student_features[:, i]
                if i == 7: val = np.clip(val, 0, 60)
                norm_val = (val - min_val) / (max_val - min_val)
                norm_features[:, i] = np.clip(norm_val, 0.0, 1.0)
                
            # Create sliding windows (14 days)
            window_days = 14
            for d in range(window_days - 1, days):
                window = norm_features[d - window_days + 1 : d + 1]
                
                # Compute label for day d based on un-normalized features to match rule-based logic
                day_raw_features = student_features[d]
                stress_label = self.compute_stress_label(day_raw_features)
                
                X_seqs.append(window)
                y_labels.append(stress_label)
                
        X_train = np.array(X_seqs, dtype=np.float32)
        y_train = np.array(y_labels, dtype=np.float32)
        
        # Save dataset
        # Resolve mindtwin-ai root directory (2 levels up from services)
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        processed_dir = os.path.join(project_root, "data", "processed")
        os.makedirs(processed_dir, exist_ok=True)
        save_path = os.path.join(processed_dir, "training_data.npz")
        np.savez(save_path, X=X_train, y=y_train)
        
        return X_train, y_train
