import pickle
import pandas as pd
import sys
import json
import os

def predict_waiting_time(date, time, current_queue_length, average_service_time, 
                         time_of_day, day_of_week, is_holiday, customer_type_mix, 
                         weather_condition, recent_incident, special_offer_running,
                         model_path='./models/best_waiting_time_model.pkl',
                         encoders_path='./models/label_encoders.pkl',
                         scaler_path='./models/scaler.pkl',
                         features_path='./models/feature_columns.pkl'):
    """
    Predict waiting time using the specified input fields.
    """
    try:
        # Load model and preprocessing components
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
        
        with open(encoders_path, 'rb') as f:
            encoders = pickle.load(f)
        
        with open(scaler_path, 'rb') as f:
            scaler = pickle.load(f)
            
        with open(features_path, 'rb') as f:
            feature_columns = pickle.load(f)
        
        # Convert date to datetime
        date_obj = pd.to_datetime(date)
        
        # Extract date features
        day = date_obj.day
        month = date_obj.month
        year = date_obj.year
        dayofweek_num = date_obj.dayofweek
        is_weekend = 1 if dayofweek_num >= 5 else 0
        quarter = (month - 1) // 3 + 1
        
        # Extract time features
        time_obj = pd.to_datetime(time, format='%H:%M')
        hour = time_obj.hour
        minute = time_obj.minute
        time_decimal = hour + minute/60
        rush_hour = 1 if ((hour >= 7 and hour <= 9) or (hour >= 17 and hour <= 19)) else 0
        
        # Encode categorical variables
        time_of_day_encoded = encoders['time_of_day'].get(time_of_day, 0)
        day_of_week_encoded = encoders['day_of_week'].get(day_of_week, 0)
        customer_type_encoded = encoders['customer_type_mix'].get(customer_type_mix, 0)
        weather_encoded = encoders['weather_condition'].get(weather_condition, 0)
        
        # Create input data with same structure as training data
        input_data = pd.DataFrame({
            'current_queue_length': [current_queue_length],
            'average_service_time': [average_service_time],
            'time_of_day': [time_of_day_encoded],
            'day_of_week': [day_of_week_encoded],
            'is_holiday': [is_holiday],
            'customer_type_mix': [customer_type_encoded],
            'weather_condition': [weather_encoded],
            'recent_incident': [recent_incident],
            'special_offer_running': [special_offer_running],
            'day': [day],
            'month': [month],
            'year': [year],
            'dayofweek_num': [dayofweek_num],
            'is_weekend': [is_weekend],
            'quarter': [quarter],
            'hour': [hour],
            'minute': [minute],
            'time_decimal': [time_decimal],
            'rush_hour': [rush_hour]
        })
        
        # Reorder columns to match training data
        input_data = input_data[feature_columns]
        
        # Scale the input data
        input_scaled = scaler.transform(input_data)
        
        # Make prediction
        prediction = model.predict(input_scaled)[0]
        
        return prediction
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Get input data from command line argument (JSON string)
    if len(sys.argv) > 1:
        try:
            # Parse JSON input
            input_data = json.loads(sys.argv[1])
            
            # Extract all required parameters
            date = input_data.get('date')
            time = input_data.get('time')
            current_queue_length = float(input_data.get('current_queue_length', 0))
            average_service_time = float(input_data.get('average_service_time', 5.5))
            time_of_day = input_data.get('time_of_day', 'Afternoon')
            day_of_week = input_data.get('day_of_week', 'Monday')
            is_holiday = int(input_data.get('is_holiday', 0))
            customer_type_mix = input_data.get('customer_type_mix', 'Mixed')
            weather_condition = input_data.get('weather_condition', 'Sunny')
            recent_incident = int(input_data.get('recent_incident', 0))
            special_offer_running = int(input_data.get('special_offer_running', 0))
            
            # Make prediction
            prediction = predict_waiting_time(
                date=date,
                time=time,
                current_queue_length=current_queue_length,
                average_service_time=average_service_time,
                time_of_day=time_of_day,
                day_of_week=day_of_week,
                is_holiday=is_holiday,
                customer_type_mix=customer_type_mix,
                weather_condition=weather_condition,
                recent_incident=recent_incident,
                special_offer_running=special_offer_running
            )
            
            # Return prediction as JSON
            print(json.dumps({"prediction": float(prediction)}))
            
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"error": "No input data provided"})) 