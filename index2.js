const { MongoClient } = require('mongodb');

const drivers = [
    { name: "Syafiq", age: 55 },
    { name: "Syafiq", age: 23 },
   
];

console.log(drivers);
//console.log(drivers[0].name);

//TODO: show all the drivers name in the console
for (let i = 0; i < drivers.length; i++) {
    console.log(drivers[i].name);
}

//TODO: Add additional driver to the array
drivers.push({ name: "Ali", age: 30 });
console.log(drivers);

//kau gi test dulu semua code after TODO ni, lepas tu baru kita sambung

async function main() {
//replace <connection-string> with your MongoDB URI
const uri ="mongodb://localhost:27017";
const client = new MongoClient(uri);

try{
    await client.connect();
    console.log("Connected to MongoDB");//console.log very important to check if the connection is successful
     
    //Access the database and collection
    const db = client.db("testDB");
    const collection =db.collection ("users");

    //Insert a document
    await collection.insertOne({ name: "Syafiq", age: 55});
    console.log("Document inserted!");
    //await collection.insertOne({ name: "Syafiq", age: 23});
    console.log("Document inserted!");

    //Query the document
    const result = await collection.findOne({ name: "Syafiq"});
    console.log("Query result:", result);
        
    }catch (err){
    console.error("Error:", err);

    }finally{
    await client.close();
    }

}

main();