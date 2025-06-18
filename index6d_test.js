require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

let db;

// MongoDB connection URL and database name
const url = 'mongodb://localhost:27017';
const dbName = 'testdb'; // Replace with your actual database name

// Connect to MongoDB client
async function connectToMongoDB() {
  console.log("Script is running...");
  const client = new MongoClient(url);
  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    console.log("Connected to MongoDB!");
    db = client.db(dbName);
  } catch (err) {
    console.error("Error:", err);
  }
}

connectToMongoDB();

// ----- Authentication & Authorization Middleware -----
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // contains userId and role
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  next();
};

// -------------------------- USER ROUTES --------------------------

app.post('/users/register', async (req, res) => {
  try {
    const { email, password, role, ...otherData } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) return res.status(409).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { email, password: hashedPassword, role: role || "customer", ...otherData };
    await db.collection('users').insertOne(user);
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(400).json({ error: "Registration failed" });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// -------------------------- ADMIN ROUTES --------------------------

app.get('/admin/users', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const users = await db.collection('users').find().toArray();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.delete('/admin/users/:id', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "User Not Found" });
    res.status(204).send(); // No Content
  } catch (err) {
    res.status(400).json({ error: "Invalid User Id Or Data" });
  }
});

// -------------------------- PASSENGERS ANALYTICS ROUTE --------------------------

app.get('/analytics/passengers', async (req, res) => {
  try {
    const collection = db.collection('users'); // Replace with the appropriate collection name

    // MongoDB Aggregation Pipeline
    const pipeline = [
      {
        '$lookup': {
          'from': 'rides',
          'localField': 'userName',
          'foreignField': 'userName',
          'as': 'usersRides'
        }
      },
      {
        '$unwind': {
          'path': '$usersRides'
        }
      },
      {
        '$group': {
          '_id': '$userName',
          'totalRides': { '$sum': 1 },
          'totalFare': { '$sum': '$usersRides.fare' },
          'avgDistance': { '$sum': '$usersRides.distance' }
        }
      },
      {
        '$project': {
          'userName': '$_id', 
          'totalRides': 1, 
          'totalFare': 1, 
          'avgDistance': 1, 
          '_id': 0
        }
      }
    ];

    // Execute the aggregation pipeline
    const analytics = await collection.aggregate(pipeline).toArray();

    // Send the response with the aggregation result
    res.json(analytics);
  } catch (error) {
    console.error('Error executing aggregation pipeline:', error);
    res.status(500).send('Internal Server Error');
  }
});

// -------------------------- SERVER LISTENING --------------------------

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
