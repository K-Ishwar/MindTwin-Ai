-- Add push_token column to students table for Expo Push Notifications
ALTER TABLE students ADD COLUMN push_token VARCHAR(255);
