import { MongoClient } from "mongodb";
import { createClient } from "redis";

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let EXPIRATION_TIME = 60; // 60 seconds
async function getStudentsFromCache(className) {
  const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  let key = `students:${className}`;

  // Check if the the students are the in the cache e.g. students:Web Development:cached
  const exists = await client.get(key + ":cached");

  console.log("🔍 Checking if the cache is valid", key + ":cached", exists);

  try {
    if (exists) {
      let students = [];

      const studentKeys = await client.lRange(key, 0, -1);
      for (let studentKey of studentKeys) {
        students.push(await client.hGetAll(studentKey));
      }

      return students;
    } else {
      return null;
    }
  } finally {
    await client.disconnect();
  }
}

async function saveStudentsToCache(className, students) {
  async function saveStudent(student) {
    const studentKey = `student:${className}:${student._id}`;

    const res = await client.hSet(
      studentKey,
      // Generates something like ["_id", "1", "first_name", "John Doe", ...]
      Object.entries(student) // Transforms the object into an array of key-value pairs
        .flat() // Goes from  [ [k1, v1], [k2, v2] ] to [k1, v1, k2, v2]
        .map((d) => d.toString()) // Converts the id to string
    );

    // console.log("🐑 Student saved to cache", studentKey, res);

    return studentKey;
  }

  const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  let key = `students:${className}`;

  let before = performance.now();
  client.del(key); // Deletes the list of students
  try {
    for (let student of students) {
      const studentKey = await saveStudent(student);
      await client.rPush(key, studentKey);
    }
    
    // Thist string tells us if the cache is valid or not
    await client.set(key + ":cached", 1, { EX: EXPIRATION_TIME }); // 60 seconds cache
    console.log("Setting the cache for", key + ":cached");
    console.log(
      "🧸 Students saved to cache total",
      students.length,
      " Took: ",
      performance.now() - before
    );
  } finally {
    await client.disconnect();
  }
}

async function getStudentsFromMongo(className) {
  console.log("connecting to mongo on ", MONGO_URL);
  const filter = {
    className: className,
  };

  const client = await MongoClient.connect(MONGO_URL);
  const coll = client.db("nodeRedisCacheExample").collection("Students");
  const cursor = coll.find(filter);
  const students = await cursor.toArray();
  await client.close();

  return students;
}

// Returns the list of students for a classname, checking first in the cache
async function getStudents(className) {
  let students = [];
  console.log("Checking if the resource is in the cache", className);

  let before = performance.now();
  // Returns false if the students are not in the cache
  students = await getStudentsFromCache(className);
  if (!students) {
    console.log(
      "🚫 Resource not found in the cache, checking mongo",
      className
    );
    before = performance.now();
    students = await getStudentsFromMongo(className);
    console.log(
      "🏋🏼‍♀️ Resource found in Mongo",
      className,
      students.length,
      " took: ",
      performance.now() - before
    );

    await saveStudentsToCache(className, students);
  } else {
    console.log(
      "👍 Resource found in the cache",
      className,
      students.length,
      " took:",
      performance.now() - before
    );
  }
  return students;
}

// Cleanup the cache
async function cleanupCache() {
  const client = await createClient()
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  const exists = await client.flushAll();
  console.log("☠️ Cache cleaned", exists);

  await client.disconnect();
}

let before = performance.now();
// await cleanupCache();
// console.log("🧹 Cache cleaned in", performance.now() - before);

before = performance.now();
// Get the studnets for the first time (not in cache)
await getStudents("Web Development");
console.log("Students fetched in ", performance.now() - before);

before = performance.now();
// Get the students for the second time, it should be in the cache
await getStudents("Web Development");
console.log("⚽️ Students fetched in", performance.now() - before);
