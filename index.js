const express = require('express');
const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require('mongodb');
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');

// This is your test secret API key.
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

// verify jwt
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'Unauthorized Access' });
        }
        req.decoded = decoded;
        next();
    });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yrcmf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // Database collections
        const usersCollection = client.db('apparel_avenue_db').collection('users');
        const productsCollection = client.db('apparel_avenue_db').collection('products');
        const cartCollection = client.db('apparel_avenue_db').collection('cart');
        const promocodesCollection = client.db('apparel_avenue_db').collection('promocodes');
        const ordersCollection = client.db('apparel_avenue_db').collection('orders');

        // send jwt token api
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // send user(s) data api
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "User already exists" })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // get single user(s) api
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await usersCollection.findOne(query);
            res.send(result);
        })

        // update user(s) profile api
        app.patch('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updatedUser = req.body;
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    ...updatedUser,
                }
            }
            const result = await usersCollection.updateOne(
                filter,
                updatedDoc,
                options
            );
            res.send(result);
        });

        //get all products api
        app.get('/products', async (req, res) => {
            const result = await productsCollection.find().toArray();
            res.send(result);
        });

        //get a single product api
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        });

        // send product to cart api
        app.post('/cart', async (req, res) => {
            const product = req.body;
            const { productName, userEmail } = req.body;

            const existingProduct = await cartCollection.findOne({
                productName: productName,
                userEmail: userEmail
            });

            if (existingProduct) {
                return res.status(400).json({ error: 'Product already exists in the cart' });
            };

            const result = await cartCollection.insertOne(product);
            res.json(result);
        });

        // get users product from cart api
        app.get('/cart/:email', async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        // delete from cart api
        app.delete('/cart/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        // get all promocodes from db api
        app.get('/promocodes', async (req, res) => {
            const result = await promocodesCollection.find().toArray();
            res.send(result);
        });

        // create payment intent api
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        //orders add to db and items delete from cart api
        app.post('/orders', verifyJWT, async (req, res) => {
            const order = req.body;
            const insertResult = await ordersCollection.insertOne(order);

            const deleteQuery = {
                _id: {
                    $in: order.orderProductsId.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollection.deleteMany(deleteQuery);

            //send an email
            // sendPaymentConfirmationEmail(payment);

            res.send({ insertResult, deleteResult });
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You're successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("✅ Database Successfully Connected!");
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
