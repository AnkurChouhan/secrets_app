const express = require('express');
const http = require('http');          // Needed for Socket.IO server
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
const Submission = require('./models/Submission');

const app = express();
const server = http.createServer(app);  // Create HTTP server
const io = new Server(server);           // Initialize Socket.IO with server

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// --- Config ---
const MONGO_URI = 'mongodb+srv://ankurchouhanofficial:Txc1xnhu5ktZFnWz@cluster777.i70wgbx.mongodb.net/secretsDB?retryWrites=true&w=majority';
const JWT_SECRET = '2a6e5dcdd43faceb9a1a745080cf8e0149c2667010c226a53cce57fbd8f3bfacfc26e130174a41ea318b80867aea3cd38cf6bf12f880c0da0013d5954c742967';
const JWT_EXPIRATION = '';

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Middleware to check authentication (protect routes)
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.redirect('/login');
    }
    req.user = decoded;
    next();
  });
}

// Socket.IO setup (basic example)
io.on('connection', (socket) => {
  console.log('a user connected via Socket.IO');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  // Add your real-time events here if needed
});

// Routes
app.get('/', (req, res) => {
  res.render('home');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.get('/secrets', authenticateToken, (req, res) => {
  res.render('secrets', { user: req.user });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: false, // set true if HTTPS production
    sameSite: 'Strict'
  });
  res.redirect('/login');
});

// Register Route
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.render('register', { error: 'Please fill all fields' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.render('register', { error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    await newUser.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'Registration failed. Please try again.' });
  }
});

// Login Route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', { error: 'Please fill all fields' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Invalid email or password' });
    }

    const payload = { id: user._id, name: user.name };
    const options = {};
    if (JWT_EXPIRATION) options.expiresIn = JWT_EXPIRATION;

    const token = jwt.sign(payload, JWT_SECRET, options);

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // true if HTTPS production
      sameSite: 'Strict',
    });

    res.redirect('/secrets');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Login failed. Please try again.' });
  }
});

// Show submit form (protected route)
app.get('/submit', authenticateToken, async (req, res) => {
  try {
    const userSecrets = await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render('submit', { error: null, success: null, userSecrets, secret: '', category: '', isPublic: false });
  } catch (err) {
    console.error(err);
    res.render('submit', { error: 'Failed to load your secrets', success: null, userSecrets: [], secret: '', category: '', isPublic: false });
  }
});

// Handle form submission (protected route)
app.post('/submit', authenticateToken, async (req, res) => {
  const { secret, category, isPublic } = req.body;
  const trimmedSecret = secret ? secret.trim() : '';

  if (!trimmedSecret) {
    return res.render('submit', { 
      error: 'Please enter your secret', 
      success: null, 
      userSecrets: await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 }),
      secret: trimmedSecret,
      category,
      isPublic: isPublic === 'true'
    });
  }

  if (!category) {
    return res.render('submit', { 
      error: 'Please select a category', 
      success: null, 
      userSecrets: await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 }),
      secret: trimmedSecret,
      category,
      isPublic: isPublic === 'true'
    });
  }

  try {
    const newSubmission = new Submission({
      userId: req.user.id,
      secret: trimmedSecret,
      category,
      isPublic: isPublic === 'true',
    });

    await newSubmission.save();

    const userSecrets = await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 });

    res.render('submit', { 
      error: null, 
      success: 'Secret saved successfully!', 
      userSecrets,
      secret: '',
      category: '',
      isPublic: false
    });
  } catch (err) {
    console.error(err);
    const userSecrets = await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render('submit', { 
      error: 'Failed to submit. Please try again.', 
      success: null,
      userSecrets,
      secret: trimmedSecret,
      category,
      isPublic: isPublic === 'true'
    });
  }
});

// Listen on Render port or fallback 5000 locally
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
