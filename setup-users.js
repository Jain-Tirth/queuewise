/**
 * Firebase User Setup Script
 * Run this script to create initial users in Firebase Authentication
 * 
 * Usage: 
 * node setup-users.js
 */

const { initializeApp } = require('firebase/app');
const { 
  getAuth, 
  createUserWithEmailAndPassword,
  signOut 
} = require('firebase/auth');
const { getDatabase, ref, set } = require('firebase/database');

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Sample users to create
const users = [
  { username: 'admin', email: 'admin@queuewise.com', password: 'admin123', role: 'admin' },
  { username: 'user', email: 'user@queuewise.com', password: 'user123', role: 'user' }
];

// Create users and add to database
async function createUsers() {
  for (const user of users) {
    try {
      console.log(`Creating user: ${user.email}`);
      
      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
      const uid = userCredential.user.uid;
      
      // Add user data to Realtime Database
      await set(ref(database, `users/${uid}`), {
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: Date.now()
      });
      
      console.log(`User created successfully: ${user.email} (${user.role})`);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`User already exists: ${user.email}`);
      } else {
        console.error(`Error creating user ${user.email}:`, error);
      }
    }
  }
  
  // Sign out after creating all users
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
  }
  
  console.log('Setup complete!');
  process.exit(0);
}

// Run the script
createUsers(); 