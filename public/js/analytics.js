document.addEventListener('DOMContentLoaded', function() {
    // Chart objects
    let peakHoursChart = null;
    let visitorsChart = null;
    
    // Function to load queue data by date
    function loadQueueData() {
        fetch('/api/queues')
            .then(response => response.json())
            .then(data => {
                const queuesContainer = document.getElementById('queues-container');
                
                if (!data || !data.queues || Object.keys(data.queues).length === 0) {
                    queuesContainer.innerHTML = '<div class="col-12"><div class="alert alert-info">No booking data available yet.</div></div>';
                    updateTotals(0, 0, 0, 0);
                    return;
                }
                
                // Update peak hours chart
                updatePeakHoursChart(data.timeDistribution || {});
                
                const queues = data.queues;
                
                // Sort dates in descending order (newest first)
                const sortedDates = Object.keys(queues).sort((a, b) => new Date(b) - new Date(a));
                
                // Update visitors chart (sorted by ascending date for chart)
                updateVisitorsChart(queues, [...sortedDates].sort((a, b) => new Date(a) - new Date(b)));
                
                // Calculate totals
                let totalWaiting = 0;
                let totalProcessing = 0;
                let totalServed = 0;
                
                Object.values(queues).forEach(queue => {
                    totalWaiting += queue.waiting;
                    totalProcessing += queue.processing;
                    totalServed += queue.served;
                });
                
                // Update the totals in the UI
                updateTotals(totalWaiting, totalProcessing, totalServed, sortedDates.length);
                
                // Generate HTML for each date
                let html = '';
                
                sortedDates.forEach(date => {
                    const queue = queues[date];
                    const dateObj = new Date(date);
                    const formattedDate = dateObj.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    });
                    
                    // Calculate progress percentage
                    const totalBookings = queue.total;
                    const servedPercentage = totalBookings > 0 ? Math.round((queue.served / totalBookings) * 100) : 0;
                    
                    // Determine card border color based on waiting status
                    let cardClass = 'border-secondary';
                    if (queue.waiting > 0) {
                        cardClass = 'border-primary';
                    } else if (queue.processing > 0) {
                        cardClass = 'border-warning';
                    } else if (queue.served > 0) {
                        cardClass = 'border-success';
                    }
                    
                    html += `
                    <div class="col-md-4">
                        <div class="card queue-card ${cardClass}">
                            <div class="card-header bg-light">
                                <span class="date-header">${formattedDate}</span>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4 text-center">
                                        <div class="badge badge-primary badge-pill p-2">
                                            <h4>${queue.waiting}</h4>
                                            <small>Waiting</small>
                                        </div>
                                    </div>
                                    <div class="col-md-4 text-center">
                                        <div class="badge badge-warning badge-pill p-2">
                                            <h4>${queue.processing}</h4>
                                            <small>Processing</small>
                                        </div>
                                    </div>
                                    <div class="col-md-4 text-center">
                                        <div class="badge badge-success badge-pill p-2">
                                            <h4>${queue.served}</h4>
                                            <small>Served</small>
                                        </div>
                                    </div>
                                </div>
                                <div class="progress mt-2" style="height: 20px;">
                                    <div class="progress-bar bg-success" 
                                         role="progressbar" 
                                         style="width: ${servedPercentage}%;" 
                                         aria-valuenow="${servedPercentage}" 
                                         aria-valuemin="0" 
                                         aria-valuemax="100">
                                        ${servedPercentage}% Complete
                                    </div>
                                </div>
                                <div class="mt-2 text-right">
                                    <small class="text-muted">Total Bookings: ${totalBookings}</small>
                                </div>
                            </div>
                        </div>
                    </div>`;
                });
                
                queuesContainer.innerHTML = html;
            })
            .catch(error => {
                console.error('Error fetching queue data:', error);
                document.getElementById('queues-container').innerHTML = 
                    '<div class="col-12"><div class="alert alert-danger">Error loading queue data. Please try again later.</div></div>';
                updateTotals('-', '-', '-', '-');
            });
    }
    
    // Function to update peak hours chart
    function updatePeakHoursChart(timeDistribution) {
        // Convert time distribution object to arrays for chart
        const hours = [];
        const counts = [];
        
        // Create 24-hour axis with 0 values for missing hours
        for (let i = 0; i < 24; i++) {
            hours.push(formatHour(i));
            counts.push(timeDistribution[i] || 0);
        }
        
        const ctx = document.getElementById('peakHoursChart').getContext('2d');
        
        // Destroy previous chart if it exists
        if (peakHoursChart) {
            peakHoursChart.destroy();
        }
        
        // Create new chart
        peakHoursChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Number of Bookings',
                    data: counts,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Bookings'
                        },
                        ticks: {
                            precision: 0
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Booking Distribution by Hour of Day'
                    },
                    tooltip: {
                        callbacks: {
                            title: function(tooltipItems) {
                                const hour = parseInt(tooltipItems[0].label.split(':')[0]);
                                return `${hour}:00 - ${hour+1}:00`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Function to update visitors by date chart
    function updateVisitorsChart(queues, sortedDates) {
        // Prepare data for visitors chart
        const dates = [];
        const totalVisitors = [];
        const servedVisitors = [];
        
        sortedDates.forEach(date => {
            const queue = queues[date];
            const shortDate = formatShortDate(date);
            
            dates.push(shortDate);
            totalVisitors.push(queue.total);
            servedVisitors.push(queue.served);
        });
        
        const ctx = document.getElementById('visitorsChart').getContext('2d');
        
        // Destroy previous chart if it exists
        if (visitorsChart) {
            visitorsChart.destroy();
        }
        
        // Create new chart
        visitorsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Total Visitors',
                        data: totalVisitors,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Served',
                        data: servedVisitors,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Visitors'
                        },
                        ticks: {
                            precision: 0
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Visitors and Service Completion by Date'
                    }
                }
            }
        });
    }
    
    // Function to format date as MM/DD
    function formatShortDate(dateString) {
        const date = new Date(dateString);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
    
    // Format hour for display (e.g., "09:00")
    function formatHour(hour) {
        return `${hour.toString().padStart(2, '0')}:00`;
    }
    
    // Function to update the total statistics
    function updateTotals(waiting, processing, served, dates) {
        document.getElementById('total-waiting').textContent = waiting;
        document.getElementById('total-processing').textContent = processing;
        document.getElementById('total-served').textContent = served;
        document.getElementById('total-dates').textContent = dates;
    }
    
    // Load queue data initially
    loadQueueData();
    
    // Refresh data every 3 seconds
    setInterval(loadQueueData, 3000);
}); 