const express = require('express');
const { MongoClient } = require('mongodb');
const port = 3000;

const app = express();
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
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });

//GET /rides - Fetch All Rides
app.get('/rides',async (req, res) => {
    try{
        const rides = await db.collection('rides').find().toArray();
        res.status(200).json(rides);
    } catch (err) {
        res.status(500).json ({ error : "Failed to fetch rides" });
    }
})

//POST /rides - Create a new ride 
app.post('/rides',async (req, res) => {
    try{
        const result  = await db.collection('rides').insertOne(req.body);
        res.status(201).json({id: result.insertID });
    } catch (err) {
        res.status(400).json ({ error : "Invalid Ride Data" });
    }
})

//PATCH /rides/:id -Update ride status
app.patch('/api/rides/:id',async (req, res) => {
    try{
        const result = await db.collection('rides').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: req.body.status } },
        );
    
        if (result.modified === 0) {
            return res.status(404).json({ error: "Ride Not Found" });
        } 
        res.status(200).json({ updated: result.modifiedCount });
    } catch (err) {
        res.status(500).json ({ error : "Invalid Ride Id Or Data" });
    }
});

//DELETE /rides/:id - Cancel A Ride
app.delete('/api/rides/:id',async (req, res) => { //Tengok balik
    try{
        const result = await db.collection('rides').deleteOne(
            { _id: new ObjectId(req.params.id) },
        );
    
        if (result.modified === 0) {
            return res.status(404).json({ error: "Ride Not Found" });
        } 
        res.status(200).json({ deleted: result.deletedCount });

    } catch (err) {
        res.status(400).json ({ error : "Invalid Ride Id Or Data" });
    }
});




/*When you see [object Object] in your console output, 
it means that you're trying to display an object as a 
string. In JavaScript, when an object is coerced into
a string (for example, when using template literals like
${delete_result}), the object's default toString() method
is called. This default method returns the string 
"[object Object]", which isn't very informative*/