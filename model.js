/**
 * This is a JavaScript implementation that simulates the waiting time prediction
 * In a production environment, you would either:
 * 1. Use a Python microservice API
 * 2. Use a child process to call Python script
 * 3. Use a library like 'onnx.js' to run the model in JavaScript
 */
function predictWaitingTime(data) {
    const {
        date,
        time,
        current_queue_length,
        average_service_time,
        time_of_day,
        day_of_week,
        is_holiday,
        customer_type_mix,
        weather_condition,
        recent_incident,
        special_offer_running
    } = data;
    
    // Parse date
    const dateObj = new Date(date);
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();
    const dayOfWeekNum = dateObj.getDay();
    const isWeekend = dayOfWeekNum >= 5 ? 1 : 0;
    const quarter = Math.floor((month - 1) / 3) + 1;
    
    // Parse time
    const [hours, minutes] = time.split(':').map(Number);
    const timeDecimal = hours + minutes / 60;
    const rushHour = ((hours >= 7 && hours <= 9) || (hours >= 17 && hours <= 19)) ? 1 : 0;
    
    // Time of day encoding (simplified)
    const timeOfDayFactors = {
        'Morning': 0.8,
        'Afternoon': 1.2,
        'Evening': 1.5,
        'Night': 0.6
    };
    
    // Day of week encoding (simplified)
    const dayOfWeekFactors = {
        'Monday': 1.0,
        'Tuesday': 0.9,
        'Wednesday': 0.95,
        'Thursday': 1.1,
        'Friday': 1.3,
        'Saturday': 1.5,
        'Sunday': 0.7
    };
    
    // Customer type encoding
    const customerTypeFactors = {
        'Mostly Regulars': 0.8,
        'Mostly New Customers': 1.3,
        'Mixed': 1.0
    };
    
    // Weather condition encoding
    const weatherFactors = {
        'Sunny': 1.0,
        'Cloudy': 1.1,
        'Rainy': 1.3,
        'Snowy': 1.5
    };
    
    // Base waiting time calculation
    let waitingTime = current_queue_length * average_service_time;
    
    // Apply factors
    waitingTime *= timeOfDayFactors[time_of_day] || 1.0;
    waitingTime *= dayOfWeekFactors[day_of_week] || 1.0;
    waitingTime *= customerTypeFactors[customer_type_mix] || 1.0;
    waitingTime *= weatherFactors[weather_condition] || 1.0;
    
    // Apply holiday factor
    if (is_holiday) {
        waitingTime *= 1.5;
    }
    
    // Apply special offer factor
    if (special_offer_running) {
        waitingTime *= 1.3;
    }
    
    // Apply incident factor
    if (recent_incident) {
        waitingTime *= 2.0;
    }
    
    // Apply rush hour factor
    if (rushHour) {
        waitingTime *= 1.2;
    }
    
    // Apply weekend factor
    if (isWeekend) {
        waitingTime *= 1.3;
    }
    
    // Add some randomness to simulate ML model variance
    const randomFactor = 0.9 + Math.random() * 0.2; // Random between 0.9 and 1.1
    waitingTime *= randomFactor;
    
    return Math.max(0, waitingTime);
}

module.exports = { predictWaitingTime }; 