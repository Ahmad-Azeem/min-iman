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

async function connectToMongoDB() {
  console.log("Script is running...");
  const uri = "mongodb://localhost:27017";
  const client = new MongoClient(uri);
  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    console.log("Connected to MongoDB!");
    db = client.db("testDB");
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

// POST /users/register - Register a passenger with hashed password
app.post('/users/register', async (req, res) => {
  try {
    const { email, password, role, ...otherData } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    // Check if user already exists
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

// POST /auth/login - User login, returns JWT token
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

// POST /users/book - Book a ride (no auth required here, but can be added if needed)
app.post('/users/book', async (req, res) => {
  try {
    const result = await db.collection('rides').insertOne(req.body);
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Data" });
  }
});

// PATCH /users/:id - Give driver's rating (protected: add auth if required)
app.patch('/users/:id', async (req, res) => {
  try {
    const result = await db.collection('drivers').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { rating: req.body.rating } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Driver Not Found" });
    res.status(200).json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: "Invalid Driver Id Or Data" });
  }
});

// -------------------------- ADMIN  --------------------------

// GET /admin/users - Show All Users Info (protected: admin only)
app.get('/admin/users', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const users = await db.collection('users').find().toArray();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET /admin/drivers - Show All Drivers Info (protected: admin only)
app.get('/admin/drivers', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const drivers = await db.collection('drivers').find().toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

// DELETE /admin/users/:id - Block users (protected: admin only)
app.delete('/admin/users/:id', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "User Not Found" });
    res.status(204).send(); // No Content
  } catch (err) {
    res.status(400).json({ error: "Invalid User Id Or Data" });
  }
});

// -------------------------- DRIVERS ROUTES --------------------------

// POST /drivers/register - Register driver (consider adding auth/admin restriction if needed)
app.post('/drivers/register', async (req, res) => {
  try {
    const result = await db.collection('drivers').insertOne(req.body);
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: "Invalid Driver Data" });
  }
});

// PATCH /drivers/:id - Update driver's availability status (protected - add auth if needed)
app.patch('/drivers/:id', async (req, res) => {
  try {
    const result = await db.collection('rides').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: "Ride Not Found" });
    res.status(200).json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: "Invalid Ride Id Or Data" });
  }
});

// POST /drivers/acceptBook - Accept a booking (same as booking ride)
app.post('/drivers/acceptBook', async (req, res) => {
  try {
    const result = await db.collection('rides').insertOne(req.body);
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Data" });
  }
});

// -------------------------- RIDES ROUTES --------------------------

// GET /rides - Fetch all rides (can protect if needed)
app.get('/rides', async (req, res) => {
  try {
    const rides = await db.collection('rides').find().toArray();
    res.status(200).json(rides);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

// DELETE /rides/:id - Cancel a ride (can protect if needed)
app.delete('/rides/:id', async (req, res) => {
  try {
    const result = await db.collection('rides').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Ride Not Found" });
    res.status(200).json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Id Or Data" });
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


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

