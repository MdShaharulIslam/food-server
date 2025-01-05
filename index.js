const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json());

// MongoDB client setup
const uri = 
`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lcvsatz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Custom middleware for JWT verification
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

// Main function to run MongoDB operations
async function run() {
  try {
    

    console.log('Connected to MongoDB!');
    const db = client.db('fooddaily');
    const foodCollection = db.collection('allFoods');
    const userCollection = db.collection('user');
    const purchasedCollection = db.collection('purchasedData');
    const feedbackCollection = db.collection('feedback');

    // Authentication routes
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    app.post('/user', async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/user', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.delete('/user/:id', async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch('/user/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/userRole/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      const user = await userCollection.findOne({ email });
      res.send({ userRole: user?.role || '' });
    });

    // Food APIs
    app.post('/all-foods', async (req, res) => {
      const post = req.body;
      const result = await foodCollection.insertOne(post);
      res.send(result);
    });

    app.get('/all-foods', async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });

    app.get('/top-foods', async (req, res) => {
      const result = await foodCollection.find().sort({ purchaseCount: -1 }).limit(6).toArray();
      res.send(result);
    });

    app.get('/search-foods', async (req, res) => {
      const query = req.query.search;
      const result = await foodCollection
        .find({ foodName: { $regex: query, $options: 'i' } })
        .toArray();
      res.send(result);
    });

    app.get('/foodDetails/:id', async (req, res) => {
      const id = req.params.id;
      const result = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch('/all-foods', verifyToken, async (req, res) => {
      const id = req.query.id;
      const updatedData = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedData };
      const result = await foodCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get('/myList', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const result = await foodCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    // Other APIs
    app.post('/purchase', async (req, res) => {
      const data = req.body;
      const result = await purchasedCollection.insertOne(data);
      const updateDoc = { $inc: { purchaseCount: 1, quantity: -data.quantity } };
      const query = { _id: new ObjectId(data.foodId) };
      await foodCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get('/feedback', async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    app.post('/feedback', async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}
run();

// Default route
app.get('/', (req, res) => {
  res.send('Food Daily server is running..');
});

// Start server
app.listen(port, () => {
  console.log(`Food Daily server is running on port ${port}`);
});
