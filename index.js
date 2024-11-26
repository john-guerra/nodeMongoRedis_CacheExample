import { MongoClient } from "mongodb";
import { createClient } from "redis";

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let EXPIRATION_TIME = 60; // 60 seconds
async function getStudentsFromCache(className) {
  const client = await createClient({
    url: REDIS_URL,
  })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  let key = `students:${className}`;

  const exists = await client.get(key + ":cached");

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

  const client = await createClient({
    url: REDIS_URL,
  })
    .on("error", (err) => console.log("Redis Client Error", err))
    .connect();

  let key = `students:${className}`;

  try {
    for (let student of students) {
      const studentKey = await saveStudent(student);
      await client.rPush(key, studentKey);
    }
    await client.set(key + ":cached", 1, { EX: EXPIRATION_TIME }); // 60 seconds cache
    console.log("🧸 Students saved to cache total", students.length);
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
  // Returns false if the students are not in the cache
  students = await getStudentsFromCache(className);
  if (!students) {
    console.log(
      "🚫 Resource not found in the cache, checking mongo",
      className
    );
    students = await getStudentsFromMongo(className);
    console.log("Resource found in mongo", className, students.length);

    await saveStudentsToCache(className, students);
  } else {
    console.log("👍 Resource found in the cache", className, students.length);
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
await cleanupCache();
console.log("🧹 Cache cleaned in", performance.now() - before);

before = performance.now();
// Get the studnets for the first time (not in cache)
await getStudents("Web Development");
console.log("🚀 Students fetched from mongo in", performance.now() - before);

before = performance.now();
// Get the students for the second time, it should be in the cache
await getStudents("Web Development");
console.log("⚽️ Students fetched from cache in", performance.now() - before);
