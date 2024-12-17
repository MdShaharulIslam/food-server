const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: [
      'http://localhost:5173',
    ],
    credentials: true,
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lcvsatz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// custom middlewares
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

async function run() {
  try {
    const foodCollection = client.db('fooddaily').collection('allFoods');
    const userCollection = client.db('fooddaily').collection('user');
    const purchasedCollection = client.db('fooddaily').collection('purchasedData');
    const feedbackCollection = client.db('fooddaily').collection('feedback');

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, {
        expiresIn: '1h',
      });

      res.send({ token });
    });

    // Store user data in database
    app.post('/user', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
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
      const updatedDoc = {
        $set: {
          role: 'admin',
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.get('/userRole/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }
      const user = await userCollection.findOne({ email });
      let userRole = '';
      if (user?.role === 'admin') {
        userRole = 'admin';
      }
      res.send({ userRole });
    });

    // User-added food item API
    app.get('/myList', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const result = await foodCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.get('/myOrder', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const result = await purchasedCollection.find({ email }).toArray();
      res.send(result);
    });

    app.delete('/myOrder', verifyToken, async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const query = { _id: new ObjectId(id) };
      const result = await purchasedCollection.deleteOne(query);
      res.send(result);
    });

    // Update user-added item
    app.patch('/all-foods', verifyToken, async (req, res) => {
      const updatedData = req.body;
      const id = req.query.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          foodName: updatedData.foodName,
          quantity: updatedData.quantity,
          price: updatedData.price,
          foodOrigin: updatedData.foodOrigin,
          foodImage: updatedData.foodImage,
          foodCategory: updatedData.foodCategory,
          description: updatedData.description,
        },
      };
      const result = await foodCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Top-6 food API
    app.get('/top-foods', async (req, res) => {
      const result = await foodCollection
        .find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Post food item API
    app.post('/all-foods', async (req, res) => {
      const post = req.body;
      const result = await foodCollection.insertOne(post);
      res.send(result);
    });

    // All foods API
    app.get('/all-foods', async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });

    // API for search functionality in all food section
    app.get('/search-foods', async (req, res) => {
      const query = req.query.search;
      const result = await foodCollection
        .find({ foodName: { $regex: query, $options: 'i' } })
        .toArray();
      res.send(result);
    });

    // Food details API for single food data
    app.get('/foodDetails/:id', async (req, res) => {
      const id = req.params.id;
      const result = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/purchase/:id', verifyToken, async (req, res) => {
      if (req.query.email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const id = req.params.id;
      const result = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Store purchased details on database
    app.post('/purchase', async (req, res) => {
      const data = req.body;
      const result = await purchasedCollection.insertOne(data);
      const updateDoc = {
        $inc: { purchaseCount: 1, quantity: -data.quantity },
      };
      const query = { _id: new ObjectId(data.foodId) };
      const updateCount = await foodCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Get API for customer feedback
    app.get('/feedback', async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    app.get('/testimonials', async (req, res) => {
      const result = await feedbackCollection.find().limit(4).toArray();
      res.send(result);
    });

    app.post('/feedback', async (req, res) => {
      const query = req.body;
      const result = await feedbackCollection.insertOne(query);
      res.send(result);
    });

    console.log('Connected to MongoDB!');
  } finally {
    // Ensure client closes when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Food Daily server is running..');
});

app.listen(port, () => {
  console.log('Food Daily server is running..');
});
