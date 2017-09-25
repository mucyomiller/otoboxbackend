// compatible API routes.
require('dotenv').config();
var express = require('express');
var multer  = require('multer');
var ParseServer = require('parse-server').ParseServer;
var bodyParser  = require('body-parser');
var path = require('path');
var Parse = require('parse/node');
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');
var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var session      = require('express-session');

var configDB = require('./config/database.js')




//multer configs
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})

var upload = multer({ storage: storage })

var databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;

if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

var api = new ParseServer({
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: process.env.APP_ID || 'myAppId',
  masterKey: process.env.MASTER_KEY || '', //Add your master key here. Keep it secret!
  serverURL: process.env.SERVER_URL || 'http://localhost:1337/parse',  // Don't forget to change to https if needed
  liveQuery: {
    classNames: ["Posts", "Comments"] // List of classes to support for query subscriptions
  }
});
// Client-keys like the javascript key or the .NET key are not necessary with parse-server
// If you wish you require them, you can set them as options in the initialization above:
// javascriptKey, restAPIKey, dotNetKey, clientKey

//configure parse client
Parse.initialize(process.env.APP_ID);
Parse.serverURL = String(process.env.SERVER_URL)

var app = express();

//setting template engine
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));

//Body Parser middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

//other middleware
// configuration ======================
mongoose.connect(configDB.url); // connect to our database
require('./config/passport')(passport); // pass passport for configuration
// set up our express application
app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
// required for passport
app.use(session({ secret: 'heykotlinkotlinhaha' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session
// routes =============================
require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport


// route middleware to make sure
function isLoggedIn(req, res, next) {
  
    // if user is authenticated in the session, carry on
    if (req.isAuthenticated())
      return next();
  
    // if they aren't redirect them to the home page
    res.redirect('/login');
  }

// Serve static assets from the /public folder
app.use('/public', express.static(path.join(__dirname, '/public')));

// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';
app.use(mountPath, api);


//DB Schema

// Parse Server plays nicely with the rest of your web routes
app.get('/',isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/profile2',function(req,res){
  res.render('profile');
});
app.get('/brand',function(req,res){
  if(req.query.action){
    res.render('brand',{query:req.query.action});
  }
  else{
    var Brand = Parse.Object.extend("Brand");
    var query = new Parse.Query(Brand);
    query.find({
    success: function(Brand) {
    // The object was retrieved successfully.
    //   Brand.forEach(function(element) {
    //     console.log(element.get("url"));
    // });
      res.render('brand',{Brands: Brand});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  
  }
});

app.post('/brand/add',upload.single('brandpic'),(req,res)=>{
  var Brand = Parse.Object.extend("Brand");
  // Create a new instance of that class.
  var mBrand = new Brand();
  mBrand.set("name",req.body.brandname);
  mBrand.set("url",req.file.path);
  mBrand.save(null, {
    success: function(mBrand) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mBrand.id);
    },
    error: function(mBrand, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/brand');
});

app.get('/model',function(req,res){
  if(req.query.action){
    var Brand = Parse.Object.extend("Brand");
    var query = new Parse.Query(Brand);
    query.find({
    success: function(Brand) {
      res.render('model',{query:req.query.action,Brands: Brand});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
  else{
    var Model = Parse.Object.extend("Model");
    var query = new Parse.Query(Model);
    query.include("parent");
    query.find({
    success: function(Model) {
      res.render('model',{Models: Model});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

app.post('/model/add',upload.single('modelpic'),(req,res)=>{
  var Brand = Parse.Object.extend("Brand");
  // Create a new instance of that class.
  var mBrand = new Brand();
  mBrand.id = req.body.brandid;
  var Model = Parse.Object.extend("Model");
  var mModel = new Model();
  mModel.set("name",req.body.modelname);
  mModel.set("released", req.body.modelyear);
  mModel.set("url",req.file.path);
  mModel.set("parent", mBrand);
  mModel.save(null, {
    success: function(mModel) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mModel.id);
    },
    error: function(mModel, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/model');
});

// There will be a test page available on the /test path of your server url
// Remove this before launching your app
// app.get('/test', function(req, res) {
//   res.sendFile(path.join(__dirname, '/public/test.html'));
// });

var port = process.env.PORT || 1337;
var httpServer = require('http').createServer(app);
httpServer.listen(port, function() {
    console.log('otobox backend is running on port ' + port + '.');
});

// This will enable the Live Query real-time server
ParseServer.createLiveQueryServer(httpServer);
