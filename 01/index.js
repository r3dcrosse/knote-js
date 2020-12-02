const path = require('path')
const express = require('express')
const fs = require('fs')
const MongoClient = require('mongodb').MongoClient
const multer = require('multer')
const marked = require('marked')
const { ObjectId } = require('mongodb')

const app = express()
const port = process.env.PORT || 3000
const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017/dev'

async function initMongo() {
  console.log('Initialising MongoDB...')
  let success = false
  while (!success) {
    try {
      client = await MongoClient.connect(mongoURL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      success = true
    } catch {
      console.log('Error connecting to MongoDB, retrying in 1 second')
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  console.log('MongoDB initialised')
  return client.db(client.s.options.dbName).collection('notes')
}

async function start() {
  const db = await initMongo()

  app.set('view engine', 'pug')
  app.set('views', path.join(__dirname, 'views'))
  app.use(express.static(path.join(__dirname, 'public')))

  app.get('/', async (req, res) => {
    res.render('index', { notes: await retrieveNotes(db) })
  })

  app.get('/uploads/:id', async (req, res) => {
    const id = req.params.id;
    
    const img = await getImage(db, id);
    res.set('Content-Type', img.contentType)
    res.send(Buffer.from(img.data.buffer));
  })

  app.post(
    '/note',
    multer({ dest: path.join(__dirname, 'public/uploads/') }).single('image'),
    async (req, res) => {
      if (!req.body.upload && req.body.description) {
        await saveNote(db, { type: "note", description: req.body.description })
        res.redirect('/')
      } else if (req.body.upload && req.file) {
        
        // Save the image in mongo
        const { insertedId } = await saveImage(db, path.join(__dirname, `public/uploads/${req.file.filename}`))
        const link = `/uploads/${insertedId}`
    
        res.render('index', {
          content: `${req.body.description} ![](${link})`,
          notes: await retrieveNotes(db),
        })
      }
    },
  )

  app.listen(port, () => {
    console.log(`App listening on http://localhost:${port}`)
  })
}

async function saveNote(db, note) {
  await db.insertOne(note)
}

async function saveImage(db, imagePath) {
    const newImage = { type: "image", data: fs.readFileSync(imagePath), contentType: 'image/png' };
    return await db.insertOne(newImage)
}

async function getImage(db, id) {
    return await db.findOne(ObjectId(id))
}

async function retrieveNotes(db) {
  const notesAndImages = (await db.find().toArray()).reverse()

  const notes = notesAndImages.filter(({ type }) => type === "note");

  return notes.map(it => {
    return { description: it.description ? marked(it.description) : ""}
  })
}

start()
