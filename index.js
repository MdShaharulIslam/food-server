const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: [
      'https://yum-yacht.web.app',
      'https://yum-yacht.firebaseapp.com',
      'http://localhost:5173',
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2fh4pkj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// custom middlewares

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    console.log('middle', req.user);
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    };

    const foodCollection = client.db('yumYacht').collection('allFoods');
    const userCollection = client.db('yumYacht').collection('user');
    const purchasedCollection = client
      .db('yumYacht')
      .collection('purchasedData');
    const feedbackCollection = client.db('yumYacht').collection('feedback');

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, {
        expiresIn: '1h',
      });

      res.cookie('token', token, cookieOptions).send({ success: true });
    });

    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res
        .clearCookie('token', { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

    // store user data in dataBase
    app.post('/user', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch('/users/:id', async (req, res) => {
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

    // user added food item api
    app.get('/myList', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await foodCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });
    app.get('/myOrder', verifyToken, async (req, res) => {
      const email = req.query.email;
      console.log('my order', email, req.user.email);
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await purchasedCollection.find({ email }).toArray();
      res.send(result);
    });
    app.delete('/myOrder', verifyToken, async (req, res) => {
      const id = req.query.id;
      const email = req.query.email;
      console.log('delete my order', email, req.user.email);
      if (email !== req.user.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { _id: new ObjectId(id) };
      const result = await purchasedCollection.deleteOne(query);
      res.send(result);
    });

    // update user added item
    app.patch('/all-foods', verifyToken, async (req, res) => {
      const updatedData = req.body;
      console.log(updatedData);
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

    // top-6 food api
    app.get('/top-foods', async (req, res) => {
      const result = await foodCollection
        .find()
        .sort({ purchaseCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // post food item api
    app.post('/all-foods', async (req, res) => {
      const post = req.body;
      const result = await foodCollection.insertOne(post);
      res.send(result);
    });

    // all foods api
    app.get('/all-foods', async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });

    // api for search functionality in all food section
    app.get('/search-foods', async (req, res) => {
      const query = req.query.search;
      const result = await foodCollection
        .find({ foodName: { $regex: query, $options: 'i' } })
        .toArray();
      // console.log(result);
      res.send(result);
    });

    // food details api for single food data
    app.get('/foodDetails/:id', async (req, res) => {
      const id = req.params.id;
      const result = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    app.get('/purchase/:id', verifyToken, async (req, res) => {
      if (req.query.email !== req.user.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const id = req.params.id;
      const result = await foodCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // store purchased details on database
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

    // get api for customer feedback
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

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('yum yacht server is running..');
});

app.listen(port, () => {
  console.log('yum yacht server is running..');
});
