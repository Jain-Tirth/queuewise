document.addEventListener('DOMContentLoaded', function() {
    // Set default date to today
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date();
        const formattedDate = today.toISOString().substr(0, 10);
        dateInput.value = formattedDate;
        dateInput.min = formattedDate; // Cannot select past dates
    }
    
    // Set default time to current time rounded to next 30 minutes
    const timeInput = document.getElementById('time');
    if (timeInput) {
        const now = new Date();
        now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hours}:${minutes}`;
    }
}); 