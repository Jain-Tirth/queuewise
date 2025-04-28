const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
// Firebase imports
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, set, get, update, onValue, child } = require('firebase/database');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} = require('firebase/auth');
// We'll use this for fallback but prefer the Python model
const { predictWaitingTime: predictWaitingTimeJS } = require('./model');

const app = express();
const port = process.env.PORT || 3001; // Changed to 3001 to avoid conflicts

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'profiles');
    // Create directory if it doesn't exist
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use user ID + timestamp to ensure unique filenames
    // Make sure req.session.user exists before accessing uid
    const userId = req.session && req.session.user ? req.session.user.uid : 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${userId}_${timestamp}${ext}`);
  }
});

// File filter to only allow image files
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAdQco43lX5_FvsMevpEcTIppSU5SPY0XI",
  authDomain: "queuewise-pro.firebaseapp.com",
  databaseURL: "https://queuewise-pro-default-rtdb.firebaseio.com",
  projectId: "queuewise-pro",
  storageBucket: "queuewise-pro.firebasestorage.app",
  messagingSenderId: "530268740026",
  appId: "1:530268740026:web:c0b1b2206ce4a6c578a583",
  measurementId: "G-YQ8MV32ZBR"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Set up EJS with layouts
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Define contentFor for layout sections
app.use((req, res, next) => {
  app.locals.contentFor = function(name, content) {
    if (!res.locals.contentFor) {
      res.locals.contentFor = {};
    }

    if (content) {
      res.locals.contentFor[name] = content;
    } else {
      return res.locals.contentFor[name] || '';
    }
  };

  next();
});

// Initialize session middleware
app.use(session({
  secret: 'queuewise-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Make user available to all templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Admin authentication middleware
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.isAdmin) {
    next();
  } else {
    res.status(403).send('Access denied. Admin rights required.');
  }
};

// Regular user authentication middleware
const isRegularUser = (req, res, next) => {
  if (req.session.user && !req.session.user.isAdmin) {
    next();
  } else {
    res.status(403).send('Access denied. This page is for regular users only.');
  }
};

// Sample data for random selection
const timeOfDay = ['Morning', 'Afternoon', 'Evening', 'Night'];
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const customerTypeMix = ['Mostly Regulars', 'Mostly New Customers', 'Mixed'];
const weatherCondition = ['Sunny', 'Cloudy', 'Rainy', 'Snowy'];

// Function to get user role from Firebase
async function getUserRole(uid) {
  try {
    const userRef = ref(database, `users/${uid}`);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
      const userData = snapshot.val();
      return userData.role || 'user'; // Default to 'user' if role not set
    } else {
      // If user doesn't exist in the database yet, create a new user record
      await set(userRef, {
        role: 'user',
        createdAt: Date.now()
      });
      return 'user';
    }
  } catch (error) {
    console.error('Error getting user role:', error);
    return 'user'; // Default to regular user on error
  }
}

// Helper function to get active queue length from Firebase (only counting unserved customers)
async function getCurrentQueueLength(date) {
  try {
    const snapshot = await get(ref(database, 'bookings'));
    const bookings = snapshot.val() || {};
    // Only count active (unserved) bookings for the specific date
    let activeBookings;

    if (date) {
      // Filter by date if provided
      activeBookings = Object.values(bookings).filter(booking =>
        booking.date === date && booking.status !== 'served');
    } else {
      // Get all active bookings if no date specified
      activeBookings = Object.values(bookings).filter(booking =>
        booking.status !== 'served');
    }

    return activeBookings.length;
  } catch (error) {
    console.error('Error getting queue length:', error);
    // Fallback when Firebase fails
    console.log('Using fallback queue length of 3');
    return 3; // Default fallback value
  }
}

// Helper function to calculate average service time from past data
async function getAverageServiceTime() {
  try {
    const snapshot = await get(ref(database, 'service_times'));
    const serviceTimes = snapshot.val() || {};
    const times = Object.values(serviceTimes);

    if (times.length === 0) {
      return 5.5; // Default value if no data
    }

    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  } catch (error) {
    console.error('Error calculating average service time:', error);
    // Fallback when Firebase fails
    console.log('Using fallback service time of 5.5 minutes');
    return 5.5; // Default value on error
  }
}

// Function to simulate customers being served (now processes one by one)
function startQueueSimulation() {
  const bookingsRef = ref(database, 'bookings');
  let isProcessing = false; // Flag to track if a booking is currently being processed

  // Listen for new bookings
  onValue(bookingsRef, async (snapshot) => {
    // If already processing a booking, don't start another one
    if (isProcessing) {
      return;
    }

    const bookings = snapshot.val() || {};

    // Create array of all unprocessed bookings
    const allBookings = [];

    for (const [bookingId, booking] of Object.entries(bookings)) {
      // Skip already served or processing bookings
      if (booking.status === 'served' || booking.status === 'processing') {
        continue;
      }

      allBookings.push({ id: bookingId, booking });
    }

    // If no unprocessed bookings, return
    if (allBookings.length === 0) {
      return;
    }

    // Sort all bookings by timestamp (oldest first)
    allBookings.sort((a, b) => a.booking.timestamp - b.booking.timestamp);

    // Process only the first booking in the queue
    const { id: bookingId, booking } = allBookings[0];
    const date = booking.date;

    try {
      // Set processing flag to prevent processing multiple bookings simultaneously
      isProcessing = true;

      await update(ref(database, `bookings/${bookingId}`), {
        status: 'processing',
        processingStartTime: Date.now()
      });

      // Generate a random service time between 25 and 35 SECONDS (for testing)
      const serviceTimeSeconds = Math.floor(Math.random() * 11) + 25; // 25 to 35 seconds
      const serviceTimeMs = serviceTimeSeconds * 1000; // Convert to milliseconds

      console.log(`Processing booking ${bookingId} for date ${date}. Will be served in ${serviceTimeSeconds} seconds (TEST MODE).`);

      // Simulate service time passing
      setTimeout(async () => {
        try {
          // Mark the booking as served
          await update(ref(database, `bookings/${bookingId}`), {
            status: 'served',
            servedAt: Date.now(),
            actualServiceTime: serviceTimeSeconds // Store in seconds for testing
          });

          // Save the service time to the service_times collection
          const serviceTimeRef = push(ref(database, 'service_times'));
          await set(serviceTimeRef, serviceTimeSeconds);

          console.log(`Booking ${bookingId} has been served. Service time: ${serviceTimeSeconds} seconds`);
        } catch (error) {
          console.error(`Error updating booking ${bookingId} status:`, error);
        } finally {
          // Reset processing flag to allow the next booking to be processed
          isProcessing = false;
        }
      }, serviceTimeMs);
    } catch (error) {
      console.error(`Error processing booking ${bookingId}:`, error);
      // Reset processing flag on error to prevent deadlock
      isProcessing = false;
    }
  }, (error) => {
    console.error('Error monitoring bookings:', error);
  });

  console.log('Queue simulation started in TEST MODE (using seconds instead of minutes)');
}

// Function to get bookings for a specific date
async function getBookingsForDate(dateString) {
  try {
    const snapshot = await get(ref(database, 'bookings'));
    const bookings = snapshot.val() || {};

    // Filter bookings for the specified date
    const dateBookings = Object.values(bookings).filter(booking => {
      return booking.date === dateString;
    });

    return dateBookings;
  } catch (error) {
    console.error('Error getting bookings for date:', error);
    return [];
  }
}

// Function to call Python script for prediction
function predictWaitingTimePython(data) {
  return new Promise((resolve, reject) => {
    // Convert input data to JSON string
    const inputJson = JSON.stringify(data);

    // Call Python script with input data
    exec(`python predict.py '${inputJson}'`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Python script: ${error}`);
        // Fallback to JavaScript simulation
        const jsResult = predictWaitingTimeJS(data);
        resolve(jsResult);
        return;
      }

      if (stderr) {
        console.error(`Python script error: ${stderr}`);
      }

      try {
        // Parse output from Python script
        const result = JSON.parse(stdout);

        if (result.error) {
          console.error(`Error in Python model: ${result.error}`);
          // Fallback to JavaScript simulation
          const jsResult = predictWaitingTimeJS(data);
          resolve(jsResult);
          return;
        }

        resolve(result.prediction);
      } catch (e) {
        console.error(`Error parsing Python output: ${e}`);
        // Fallback to JavaScript simulation
        const jsResult = predictWaitingTimeJS(data);
        resolve(jsResult);
      }
    });
  });
}

// Login route - display login form
app.get('/login', (req, res) => {
  // If already logged in, redirect to home
  if (req.session.user) {
    return res.redirect('/home');
  }
  res.render('login', {
    error: null,
    title: 'Login',
    layout: false
  });
});

// Register route - display register form
app.get('/register', (req, res) => {
  // If already logged in, redirect to home
  if (req.session.user) {
    return res.redirect('/home');
  }
  res.render('register', {
    error: null,
    title: 'Register',
    layout: false
  });
});

// Register route - process registration
app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  try {
    // Validate input
    if (password !== confirmPassword) {
      return res.render('register', {
        error: 'Passwords do not match',
        title: 'Register',
        layout: false
      });
    }

    // Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Store additional user info in the database
    await set(ref(database, `users/${user.uid}`), {
      username,
      email,
      role: 'user', // Default role
      createdAt: Date.now()
    });

    // Store user in session
    req.session.user = {
      uid: user.uid,
      username,
      email,
      isAdmin: false
    };

    // Redirect to home page
    res.redirect('/home');
  } catch (error) {
    let errorMessage = 'Registration failed';
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'Email already in use';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak';
    }

    res.render('register', {
      error: errorMessage,
      title: 'Register',
      layout: false
    });
  }
});

// Login route - process login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Sign in with Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get user data from database
    const userRole = await getUserRole(user.uid);
    const isAdmin = userRole === 'admin';

    // Get the username
    const userRef = ref(database, `users/${user.uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val() || {};
    const username = userData.username || email.split('@')[0]; // Use email prefix if username not set

    // Store user in session
    req.session.user = {
      uid: user.uid,
      username,
      email: user.email,
      isAdmin
    };

    // Redirect to home page
    res.redirect('/home');
  } catch (error) {
    let errorMessage = 'Invalid email or password';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      errorMessage = 'Invalid email or password';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many failed login attempts. Please try again later.';
    }

    res.render('login', {
      error: errorMessage,
      title: 'Login',
      layout: false
    });
  }
});

// Logout route
app.get('/logout', async (req, res) => {
  try {
    // Sign out from Firebase
    await signOut(auth);

    // Clear session
    req.session.destroy();

    res.redirect('/login');
  } catch (error) {
    console.error('Error signing out:', error);
    res.redirect('/home');
  }
});

// Home route - welcome page after login
app.get('/home', isAuthenticated, (req, res) => {
  res.render('home', {
    title: 'Home'
  });
});

// Root route - redirect to login or home
app.get('/', (req, res) => {
  if (req.session.user) {
    // If admin, redirect to admin panel
    if (req.session.user.isAdmin) {
      return res.redirect('/admin');
    }
    // If regular user, redirect to booking page
    return res.redirect('/booking');
  } else {
    // Not logged in, show landing page
    res.render('landing', {
      title: 'QueueWise - Smart Queue Management'
    });
  }
});

// Booking page - only for regular users
app.get('/booking', isAuthenticated, (req, res) => {
  if (req.session.user.isAdmin) {
    // Redirect admins to admin panel
    return res.redirect('/admin');
  }
  res.render('index', {
    isAdmin: false,
    title: 'Book Your Spot',
    layout: false
  });
});

// Route to render the booking form - protected with regular user authentication
app.get('/', isAuthenticated, (req, res) => {
  if (req.session.user.isAdmin) {
    // Redirect admins to admin panel
    return res.redirect('/admin');
  }
  res.render('index', {
    isAdmin: false,
    title: 'Book Your Spot',
    layout: false
  });
});

// Route to handle admin panel - protected with admin authentication
app.get('/admin', isAuthenticated, (req, res) => {
  if (!req.session.user.isAdmin) {
    // Redirect regular users to booking page
    return res.redirect('/');
  }
  res.render('admin', {
    title: 'Admin Panel',
    layout: false
  });
});

// Route for analytics page - protected with admin authentication
app.get('/analytics', isAuthenticated, (req, res) => {
  if (!req.session.user.isAdmin) {
    // Redirect regular users to booking page
    return res.redirect('/');
  }
  res.render('analytics', {
    title: 'Analytics Dashboard',
    layout: false
  });
});

// Profile route - display user profile
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    // Get user data from Firebase
    const userRef = ref(database, `users/${req.session.user.uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val() || {};

    // Merge session data with database data
    const userProfile = {
      ...req.session.user,
      ...userData,
      createdAt: userData.createdAt || Date.now()
    };

    // Get user's booking history
    const bookingsRef = ref(database, 'bookings');
    const bookingsSnapshot = await get(bookingsRef);
    const allBookings = bookingsSnapshot.val() || {};

    // Filter bookings for this user
    const userBookings = Object.values(allBookings).filter(booking =>
      booking.userId === req.session.user.uid
    );

    // Sort bookings by date (newest first)
    userBookings.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.render('profile', {
      title: 'Profile',
      userData: userProfile,
      bookings: userBookings,
      message: req.session.profileMessage || null
    });

    // Clear any flash messages
    delete req.session.profileMessage;
  } catch (error) {
    console.error('Error fetching profile data:', error);
    res.render('profile', {
      title: 'Profile',
      userData: req.session.user,
      bookings: [],
      message: { type: 'error', text: 'Error loading profile data. Please try again.' }
    });
  }
});

// Update profile information
app.post('/profile/update', isAuthenticated, upload.single('profileImage'), async (req, res) => {
  try {
    const { displayName, phoneNumber, bio } = req.body;
    const userId = req.session.user.uid;

    // Update data in Firebase
    const updates = {
      displayName: displayName || req.session.user.username,
      phoneNumber: phoneNumber || null,
      bio: bio || null,
      updatedAt: Date.now()
    };

    // If a profile image was uploaded, add the path
    if (req.file) {
      // Create the public URL for the image
      const imageUrl = `/uploads/profiles/${req.file.filename}`;
      updates.photoURL = imageUrl;
    }

    // Update in Firebase database
    await update(ref(database, `users/${userId}`), updates);

    // Update session data
    req.session.user.username = displayName || req.session.user.username;
    if (req.file) {
      req.session.user.photoURL = updates.photoURL;
    }

    // Set success message
    req.session.profileMessage = { type: 'success', text: 'Profile updated successfully!' };

    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating profile:', error);
    req.session.profileMessage = { type: 'error', text: 'Error updating profile. Please try again.' };
    res.redirect('/profile');
  }
});

// Change password
app.post('/profile/change-password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate passwords
    if (newPassword !== confirmPassword) {
      req.session.profileMessage = { type: 'error', text: 'New passwords do not match.' };
      return res.redirect('/profile');
    }

    // Get current user
    const user = auth.currentUser;

    // Re-authenticate user before changing password
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    req.session.profileMessage = { type: 'success', text: 'Password changed successfully!' };
    res.redirect('/profile');
  } catch (error) {
    console.error('Error changing password:', error);
    let errorMessage = 'Error changing password. Please try again.';

    if (error.code === 'auth/wrong-password') {
      errorMessage = 'Current password is incorrect.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'New password is too weak. Please use a stronger password.';
    }

    req.session.profileMessage = { type: 'error', text: errorMessage };
    res.redirect('/profile');
  }
});

// Update user preferences
app.post('/profile/preferences', isAuthenticated, async (req, res) => {
  try {
    const { emailNotifications, smsNotifications, language, timeFormat } = req.body;
    const userId = req.session.user.uid;

    // Prepare preferences object
    const preferences = {
      emailNotifications: emailNotifications === 'on',
      smsNotifications: smsNotifications === 'on',
      language: language || 'en',
      timeFormat: timeFormat || '12h'
    };

    // Update in Firebase database
    await update(ref(database, `users/${userId}`), {
      preferences,
      updatedAt: Date.now()
    });

    req.session.profileMessage = { type: 'success', text: 'Preferences updated successfully!' };
    res.redirect('/profile');
  } catch (error) {
    console.error('Error updating preferences:', error);
    req.session.profileMessage = { type: 'error', text: 'Error updating preferences. Please try again.' };
    res.redirect('/profile');
  }
});

// API endpoint to get queue status
app.get('/api/queue', isAuthenticated, async (req, res) => {
  try {
    const queueLength = await getCurrentQueueLength();
    const averageServiceTime = await getAverageServiceTime();

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = await getBookingsForDate(today);

    res.json({
      queueLength,
      averageServiceTime,
      served: todayBookings.filter(b => b.status === 'served').length,
      processing: todayBookings.filter(b => b.status === 'processing').length,
      waiting: todayBookings.filter(b => !b.status || b.status === 'waiting').length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New API endpoint to get queue status by date - admin only
app.get('/api/queues', isAuthenticated, async (req, res) => {
  // Only allow admin access
  if (!req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied. Admin rights required.' });
  }

  try {
    const snapshot = await get(ref(database, 'bookings'));
    const bookings = snapshot.val() || {};

    // Group bookings by date
    const queues = {};
    // Time distribution for peak hour analysis
    const timeDistribution = {};

    for (const [bookingId, booking] of Object.entries(bookings)) {
      const date = booking.date;
      const time = booking.time;

      // Initialize date entry if it doesn't exist
      if (!queues[date]) {
        queues[date] = {
          waiting: 0,
          processing: 0,
          served: 0,
          total: 0
        };
      }

      // Count by status
      queues[date].total++;

      if (booking.status === 'served') {
        queues[date].served++;
      } else if (booking.status === 'processing') {
        queues[date].processing++;
      } else {
        queues[date].waiting++;
      }

      // Add to time distribution for peak hour analysis
      // Extract hour from time (e.g., "14:30" -> 14)
      if (time) {
        const hour = parseInt(time.split(':')[0], 10);
        if (!isNaN(hour)) {
          if (!timeDistribution[hour]) {
            timeDistribution[hour] = 0;
          }
          timeDistribution[hour]++;
        }
      }
    }

    res.json({
      queues,
      timeDistribution
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to determine time of day based on hour
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

// Helper function to get day of week
function getDayOfWeek(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// Route to handle the booking form submission - protected with regular user authentication
app.post('/book', isAuthenticated, async (req, res) => {
  if (req.session.user.isAdmin) {
    return res.status(403).send('Booking is not available for admin users');
  }

  try {
    const { date, time, isHoliday, specialOfferRunning } = req.body;

    // Parse date and time
    const dateObj = new Date(date);
    const [hours, minutes] = time.split(':').map(Number);
    const timeObj = new Date(dateObj);
    timeObj.setHours(hours, minutes);

    // Get current queue length for the specific date and average service time
    const currentQueueLength = await getCurrentQueueLength(date);
    const averageServiceTime = await getAverageServiceTime();

    // Randomly select or determine parameters
    const selectedTimeOfDay = getTimeOfDay(hours);
    const selectedDayOfWeek = getDayOfWeek(dateObj);
    const selectedCustomerType = customerTypeMix[Math.floor(Math.random() * customerTypeMix.length)];
    const selectedWeather = weatherCondition[Math.floor(Math.random() * weatherCondition.length)];

    // Convert holiday and special offer to numeric
    const isHolidayNum = isHoliday === 'true' ? 1 : 0;
    const specialOfferRunningNum = specialOfferRunning === 'true' ? 1 : 0;

    // Set recent incident to 0 as per requirements
    const recentIncident = 0;

    // Create model input data object
    const modelInput = {
      date,
      time,
      current_queue_length: currentQueueLength,
      average_service_time: averageServiceTime,
      time_of_day: selectedTimeOfDay,
      day_of_week: selectedDayOfWeek,
      is_holiday: isHolidayNum,
      customer_type_mix: selectedCustomerType,
      weather_condition: selectedWeather,
      recent_incident: recentIncident,
      special_offer_running: specialOfferRunningNum
    };

    // Save booking to Firebase
    try {
      const newBookingRef = push(ref(database, 'bookings'));
      await set(newBookingRef, {
        ...modelInput,
        timestamp: Date.now(),
        status: 'waiting' // Initial status
      });
      console.log('Booking saved to Firebase successfully');
    } catch (error) {
      console.error('Error saving booking to Firebase:', error);
      console.log('Continuing with prediction without saving to Firebase');
      // Proceed without saving to Firebase
    }

    // Try to use Python model, with JS model as fallback
    let waitingTime;
    try {
      // Call Python script for prediction
      waitingTime = await predictWaitingTimePython(modelInput);
    } catch (error) {
      console.error('Error using Python model, falling back to JS:', error);
      // Fallback to JavaScript model
      waitingTime = predictWaitingTimeJS(modelInput);
    }

    res.render('result', {
      waitingTime: waitingTime.toFixed(2),
      modelInput
    });
  } catch (error) {
    console.error('Error processing booking:', error);
    res.status(500).send('An error occurred while processing your booking');
  }
});



// Start the queue simulation
startQueueSimulation();

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  startQueueSimulation();
});