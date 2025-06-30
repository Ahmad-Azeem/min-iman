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

// ----- Middleware -----

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
      { userId: user._id, role: user.role, userName: user.userName },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/*app.post('/users/book', async (req, res) => {
  try {
    const result = await db.collection('rides').insertOne(req.body);
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Data" });
  }
});*/

//In /users/book endpoint - Add status when creating ride:
app.post('/users/book', async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.userName || !req.body.pickupLocation || !req.body.destination) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const ride = {
      userName: req.body.userName,
      pickupLocation: req.body.pickupLocation,
      destination: req.body.destination,
      fare: req.body.fare || 0,
      distance: req.body.distance || 0,
      status: "requested",
      createdAt: new Date(),
      // NO driver fields here!
    };

    const result = await db.collection('rides').insertOne(ride);
    
    // Verify insertion
    const insertedRide = await db.collection('rides').findOne({
      _id: result.insertedId
    });
    
    if (!insertedRide) {
      throw new Error("Failed to create ride - database error");
    }

    res.status(201).json({
      id: result.insertedId,
      message: "Ride booked successfully",
      debug: insertedRide // Shows exactly what was saved
    });
  } catch (err) {
    console.error("BOOKING ERROR:", err);
    res.status(500).json({ 
      error: "Booking failed",
      details: err.message 
    });
  }
});
// Then modify available rides endpoint to look for this status:
app.get('/drivers/available-rides', authenticate, authorize(['driver']), async (req, res) => {
  try {
    const rides = await db.collection('rides').find({
      status: "requested",
      driverId: { $exists: false }
    }).toArray();
    
    console.log('Available rides:', rides); // Debug log
    res.status(200).json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// NEW: Users view driver info (only selected fields)
app.get('/users/drivers', authenticate, authorize(['customer']), async (req, res) => {
  try {
    const drivers = await db.collection('drivers').find(
      {},
      {
        projection: {
          _id: 0,
          driverName: 1,
          vehicleType: 1,
          isAvailable: 1,
          rating: 1
        }
      }
    ).toArray();

    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch driver info" });
  }
});

// NEW: Rate a driver (based on completed rides)
app.post('/users/rate-driver', authenticate, authorize(['customer']), async (req, res) => {
  try {
    const { rideId, rating } = req.body;
    
    // Validate input
    if (!rideId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Valid rideId and rating (1-5) required" });
    }

    // 1. Find the completed ride for this user
    const ride = await db.collection('rides').findOne({
      _id: new ObjectId(rideId),
      status: "completed",
      userName: req.user.userName // Using email as username identifier
    });

    if (!ride) {
      return res.status(404).json({ 
        error: "No completed ride found with this ID for your account",
        debug: {
          yourEmail: req.user.email,
          requestedRideId: rideId
        }
      });
    }

    if (!ride.driverId) {
      return res.status(400).json({ error: "This ride has no assigned driver" });
    }

    // 2. Update driver's rating (average calculation)
    const driver = await db.collection('drivers').findOne({ 
      _id: new ObjectId(ride.driverId) 
    });

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const newRatingCount = (driver.ratingCount || 0) + 1;
    const newAverage = ((driver.rating || 0) * (newRatingCount - 1) + rating) / newRatingCount;

    await db.collection('drivers').updateOne(
      { _id: new ObjectId(ride.driverId) },
      { 
        $set: { 
          rating: newAverage,
          ratingCount: newRatingCount 
        } 
      }
    );

    // 3. Mark ride as rated to prevent duplicate ratings
    await db.collection('rides').updateOne(
      { _id: new ObjectId(rideId) },
      { $set: { isRated: true } }
    );

    res.status(200).json({ 
      message: "Rating submitted successfully",
      driverId: ride.driverId,
      newAverageRating: newAverage.toFixed(2)
    });
  } catch (err) {
    console.error("RATING ERROR:", err);
    res.status(500).json({ 
      error: "Rating failed",
      details: err.message 
    });
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

app.get('/admin/drivers', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const drivers = await db.collection('drivers').find().toArray();
    res.status(200).json(drivers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

app.delete('/admin/users/:id', authenticate, authorize(['admin','driver']), async (req, res) => {
  try {
    const result = await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "User Not Found" });
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: "Invalid User Id Or Data" });
  }
});

// -------------------------- DRIVERS ROUTES --------------------------

app.post('/drivers/register', async (req, res) => {
  try {
    const { email, password, ...otherData } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existingDriver = await db.collection('drivers').findOne({ email });
    if (existingDriver) return res.status(409).json({ error: "Driver already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const driver = { email, password: hashedPassword, role: "driver", ...otherData };

    await db.collection('drivers').insertOne(driver);
    res.status(201).json({ message: "Driver registered successfully" });
  } catch (err) {
    res.status(400).json({ error: "Registration failed" });
  }
});

// NEW: Driver login
app.post('/drivers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const driver = await db.collection('drivers').findOne({ email });
    if (!driver) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, driver.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: driver._id, role: "driver" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// NEW: Driver delete own account
app.delete('/drivers/me', authenticate, authorize(['driver']), async (req, res) => {
  try {
    const result = await db.collection('drivers').deleteOne({ _id: new ObjectId(req.user.userId) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Driver account not found" });
    res.status(200).json({ message: "Driver account deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Error deleting driver account" });
  }
});

// Update ride status (using authenticated driver's ID from token)
app.patch('/drivers/complete-ride', authenticate, authorize(['driver']), async (req, res) => {
  try {
    if (!req.body.rideId) {
      return res.status(400).json({ error: "rideId is required in request body" });
    }

    // 1. Verify the ride exists and belongs to this driver
    const ride = await db.collection('rides').findOne({
      _id: new ObjectId(req.body.rideId),
      driverId: req.user.userId // Ensure the ride belongs to this driver
    });

    if (!ride) {
      return res.status(404).json({ 
        error: "Ride not found or not assigned to you",
        debug: {
          requestedRideId: req.body.rideId,
          yourDriverId: req.user.userId
        }
      });
    }

    // 2. Update only if status is "accepted"
    if (ride.status !== "accepted") {
      return res.status(400).json({ 
        error: "Ride cannot be completed from its current state",
        currentStatus: ride.status
      });
    }

    // 3. Update the ride status
    const result = await db.collection('rides').updateOne(
      { 
        _id: new ObjectId(req.body.rideId),
        driverId: req.user.userId // Extra security check
      },
      { 
        $set: { 
          status: "completed",
          completedAt: new Date() 
        } 
      }
    );

    res.status(200).json({ 
      message: "Ride marked as completed",
      rideId: req.body.rideId
    });
  } catch (err) {
    console.error("COMPLETION ERROR:", err);
    res.status(500).json({ 
      error: "Failed to complete ride",
      details: err.message 
    });
  }
});

/*app.post('/drivers/acceptBook', async (req, res) => {
  try {
    const result = await db.collection('rides').insertOne(req.body);
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Data" });
  }
});*/

app.post('/drivers/acceptBook', authenticate, authorize(['driver']), async (req, res) => {
  try {
    if (!req.body.rideId) {
      return res.status(400).json({ error: "rideId is required" });
    }

    // 1. Verify the ride exists and is available
    const availableRide = await db.collection('rides').findOne({
      _id: new ObjectId(req.body.rideId),
      status: "requested",
      driverId: { $exists: false }
    });

    if (!availableRide) {
      // Debug exactly why it failed
      const problematicRide = await db.collection('rides').findOne({
        _id: new ObjectId(req.body.rideId)
      });
      
      return res.status(400).json({
        error: "Cannot accept ride",
        debug: {
          rideExists: !!problematicRide,
          currentStatus: problematicRide?.status,
          hasDriver: problematicRide?.driverId ? true : false,
          actualRide: problematicRide
        }
      });
    }

    // 2. Get driver info
    const driver = await db.collection('drivers').findOne({
      _id: new ObjectId(req.user.userId)
    });
    
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    // 3. Update the ride
    const updateResult = await db.collection('rides').updateOne(
      { _id: new ObjectId(req.body.rideId) },
      {
        $set: {
          status: "accepted",
          driverId: req.user.userId,
          driverName: driver.driverName || driver.email.split('@')[0],
          acceptedAt: new Date()
        }
      }
    );

    // 4. Verify update
    const updatedRide = await db.collection('rides').findOne({
      _id: new ObjectId(req.body.rideId)
    });
    
    res.status(200).json({
      message: "Ride accepted",
      debug: {
        updateResult,
        finalRideState: updatedRide
      }
    });
  } catch (err) {
    console.error("ACCEPT ERROR:", err);
    res.status(500).json({
      error: "Acceptance failed",
      details: err.message
    });
  }
});


// -------------------------- RIDES ROUTES --------------------------

app.get('/rides', async (req, res) => {
  try {
    const rides = await db.collection('rides').find().toArray();
    res.status(200).json(rides);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

app.delete('/rides/:id', async (req, res) => {
  try {
    const result = await db.collection('rides').deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Ride Not Found" });
    res.status(200).json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(400).json({ error: "Invalid Ride Id Or Data" });
  }
});

// -------------------------- ANALYTICS --------------------------

app.get('/analytics/passengers', async (req, res) => {
  try {
    const collection = db.collection('users');
    const pipeline = [
      {
        '$lookup': {
          'from': 'rides',
          'localField': 'userName',
          'foreignField': 'userName',
          'as': 'usersRides'
        }
      },
      { '$unwind': '$usersRides' },
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

    const analytics = await collection.aggregate(pipeline).toArray();
    res.json(analytics);
  } catch (error) {
    console.error('Error executing aggregation pipeline:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

//-----debugging-----
// Add this route to check database state
app.get('/debug/rides', async (req, res) => {
  try {
    const allRides = await db.collection('rides').find().toArray();
    res.status(200).json({
      totalRides: allRides.length,
      rides: allRides
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/debug/ride/:id', authenticate, async (req, res) => {
  const ride = await db.collection('rides').findOne({
    _id: new ObjectId(req.params.id)
  });
  
  res.json({
    exists: !!ride,
    rideStatus: ride?.status,
    rideUserName: ride?.userName,
    yourEmail: req.user.email,
    isYourRide: ride?.userName === req.user.email
  });
});