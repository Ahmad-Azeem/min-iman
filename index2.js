const { MongoClient } = require('mongodb');

const carDrivers =[
    {
        name: "John Doe",
        vehicleType: "Sedan",
        isAvailable: true,
        rating: 4.8 
    },
    {
        name: "Alice Smith",
        vehicleType: "SUV",
        isAvailable: false,
        rating: 4.5
    }

];


//TODO: show all the drivers name in the console
console.log(carDrivers);

//carDrivers.forEach((element) => console.log(element)); // alternative 1

/*for (let i = 0; i< carDrivers.length; i++){
    console.log(carDrivers[i]);
}*/ //alternative 2



//TODO: Add additional driver to the array
const newDriver = {
    name: "Iman",
    vehicleType: "Truck",
    isAvailable: true,
    rating: 4.7
};
carDrivers.push(newDriver);
console.log(carDrivers);
/*for (let i = 0; i < carDrivers.length; i++) {
   console.log(carDrivers[i]);*/ //alternative 1


   
async function main() {
//replace <connection-string> with your MongoDB URI
const uri ="mongodb://localhost:27017";
const client = new MongoClient(uri);

try{

   await client.connect(); 
    console.log("Connected to MongoDB");

    const db = client.db("testDB");
    const collection = db.collection("carDrivers");
    

    const carDriversCollection = db.collection("carDrivers");

    carDrivers.forEach(async (carDrivers) => {
        const result = await carDriversCollection.insertOne(carDrivers);
        console.log(`New car driver created with result: ${result}`);
    });

    const availableDrivers = await db.collection('carDrivers').find({
         isAvailable: true,
         rating: { $gte: 4.8 } // Filter for drivers with rating >= 4.8
    }).toArray();
    console.log( "Available drivers:", availableDrivers);

}finally {
    await client.close();
}

//try{
    //await client.connect(); 
    //console.log("Connected to MongoDB");//console.log very important to check if the connection is successful
     
    //Access the database and collection
   // const db = client.db("testDB");
    //const collection =db.collection ("users");

   /* //Insert a document
    await collection.insertOne({ name: "Syafiq", age: 55});
    console.log("Document inserted!");
  

    //Query the document
    result = await collection.findOne({ name: "Syafiq"});
    console.log("Query result:", result);
        
    }catch (err){
    console.error("Error:", err);

    }finally{
    await client.close();
    }*/


main()};