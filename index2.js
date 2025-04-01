const { MongoClient } = require('mongodb');

const carDrivers = [
    {  
        name: "John Doe",
        vehicleType: "Sedan",
        isAvailable: true,
        rating: 4.9
    },
    {  
        name: "Alice Smith",
        vehicleType: "SUV",
        isAvailable: false,
        rating: 4.4
    },
];

console.log(carDrivers);

const newDriver = {
    name: "Syafiq Iman",
    vehicleType: "Convertible",
    isAvailable: true,
    rating: 4.3
};
carDrivers.push(newDriver);
console.log(carDrivers);

async function main() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        console.time("Connection Time");  // Start the timer

        await client.connect();
        console.log("Connected to MongoDB");

        console.timeEnd("Connection Time");  // End the timer

        const db = client.db("testDB");
        const carDriversCollection = db.collection("carDrivers");

        //CREATE: Insert each driver in the carDrivers array
        for (const driver of carDrivers) {
            const result = await carDriversCollection.insertOne(driver);
            console.log(`New driver inserted with result: ${result}`);
        }

        //READ: Find all drivers with rating >= 4.5 and isAvailable = true
       /* const availableDrivers = await db.collection("carDrivers").find({ 
            isAvailable: true,
            rating: {$gte: 4.5} 
        }).toArray();
        console.log("available drivers:", availableDrivers);*/

        //UPDATE: Update the rating of a driver by name
        const updateResult = await db.collection('carDrivers').updateOne(
            { name: "John Doe"},
            { $inc: { rating: 0.1}}
        );

        console.log(`Driver updated with result: ${updateResult}`)

        //DELETE: Delete a driver by name

        const deleteResult = await db.collection('carDrivers').deleteOne({isAvailable: false});
        console.log(`Driver deleted with result: ${deleteResult}`);
       /* const deleteResult = await db.collection('carDrivers').deleteOne(
            { name: "Alice Smith"}
        );
        console.log(`Driver deleted with result: ${deleteResult}`)*/


    } catch (err) {
        console.error("Error:", err);

    } finally {
        await client.close();
    }
}

main();