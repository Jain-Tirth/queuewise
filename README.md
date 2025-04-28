# Organization Booking System

This is a web application for managing organization bookings with waiting time prediction using a machine learning model.

## Features

- User booking form for date and time selection
- Admin panel for system configuration
- Integration with Firebase for real-time database
- Waiting time prediction using ML model (Python or JavaScript fallback)
- Display of all model input parameters used for prediction

## Setup Instructions

### Prerequisites

- Node.js (v12.x or later)
- Python (v3.6 or later)
- Firebase account and project

### Installation

1. Clone this repository
2. Install Node.js dependencies:

```bash
npm install
```

3. Install Python dependencies:

```bash
pip install pandas scikit-learn pickle-mixin
```

4. Configure Firebase:
   - Create a Firebase project at https://console.firebase.google.com/
   - Set up a Realtime Database
   - Add your Firebase configuration to:
     - `app.js` (for server)
     - `public/js/admin.js` (for client)

5. Set up your machine learning model:
   - Place your model files in the `/models` directory:
     - `best_waiting_time_model.pkl` (the trained model)
     - `label_encoders.pkl` (categorical encoders)
     - `scaler.pkl` (feature scaler)
     - `feature_columns.pkl` (column order)

6. Start the server:

```bash
npm start
```

7. Visit http://localhost:3000 in your browser

## Python Model Integration

The application is designed to use Python for model predictions:

1. The `predict.py` script is used to load and run the model
2. Node.js calls this script as a child process
3. Data is passed via JSON strings and command line arguments
4. Results are returned to Node.js via stdout
5. A JavaScript fallback model is used if Python execution fails

### Troubleshooting Python Integration

If you encounter issues with Python integration:

1. Ensure Python is in your PATH environment variable
2. Check that you have the required Python packages installed
3. Verify model file paths in `predict.py`
4. Test the Python script directly:

```bash
python predict.py '{"date":"2023-05-15","time":"14:30","current_queue_length":5,"average_service_time":5.5,"time_of_day":"Afternoon","day_of_week":"Monday","is_holiday":0,"customer_type_mix":"Mixed","weather_condition":"Sunny","recent_incident":0,"special_offer_running":0}'
```

## Model Parameters

The following parameters are required for the prediction model:

- `date`: Selected date
- `time`: Selected time
- `current_queue_length`: Number of people in queue (calculated from database)
- `average_service_time`: Average time to serve a customer (from past data or default 5.5)
- `time_of_day`: Morning/Afternoon/Evening/Night (derived from time)
- `day_of_week`: Day of the week (derived from date)
- `is_holiday`: 0 or 1 (set by admin)
- `customer_type_mix`: Random from options
- `weather_condition`: Random from options
- `recent_incident`: Always 0
- `special_offer_running`: 0 or 1 (set by admin)

## License

MIT 