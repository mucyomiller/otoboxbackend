// compatible API routes.
require('dotenv').config();
var express = require('express');
var multer  = require('multer');
var ParseServer = require('parse-server').ParseServer;
// var csrf = require('csurf')
var bodyParser  = require('body-parser');
var path = require('path');
var Parse = require('parse/node');
var mongoose = require('mongoose');
var passport = require('passport');
var flash    = require('connect-flash');
var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var session      = require('express-session');
var moment = require('moment');
var ejs = require('ejs');
const formatCurrency = require('format-currency');

var configDB = require('./config/database.js');
var redis   = require('redis');

var rclient = redis.createClient(process.env.REDIS_PORT,process.env.REDIS_HOST);
r2client = rclient.duplicate();
rclient.subscribe("otobox:notifications",(err,reply)=>{
  if(!err){
    console.log("parse server connected to redis server!");
  }
});

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
//creating  fromnow function
app.locals.fromNow = function(date){
  return moment(date).fromNow();
}
//creating ejs template function to parse string in jsonable object
app.locals.jsonparse = function(data){
  return JSON.parse(data);
}
//creating format_currency function
// include the currency code 'USD' 
let opts = { format: '%v %c', code: 'RWF' }

app.locals.format_currency = function(money){
  return formatCurrency(money, opts);
}
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
// app.use(csrf({ cookie: true }))

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

// Parse Server plays nicely with the rest of your web routes
app.get('/',isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/profile2',function(req,res){
  res.render('profile');
});
app.get('/brand',isLoggedIn,function(req,res){
  if(req.query.action){
    res.render('brand',{query:req.query.action});
  }
  else{
    var Brand = Parse.Object.extend("Brand");
    var query = new Parse.Query(Brand);
    query.ascending("name");
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

app.post('/brand/add',isLoggedIn,upload.single('brandpic'),(req,res)=>{
  var Brand = Parse.Object.extend("Brand");
  // Create a new instance of that class.
  var mBrand = new Brand();
  mBrand.set("name",req.body.brandname);
  if(req.file  !== undefined){
    mBrand.set("url",req.file.path);
  }
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

//brand remove
app.get('/brand/remove/:id',isLoggedIn,(req,res)=>{
  
    var Brand = Parse.Object.extend("Brand");
    // Create a new instance of that class.
    var mBrand = new Brand();
    mBrand.id = req.params.id;
    mBrand.destroy({
      success: function(mBrand) {
        // The object was deleted from the Parse Cloud.
        console.log("Brand object delete it's id is"+mBrand.id);
        req.flash('message',req.flash('Successfully deleted'));
      },
      error: function(mBrand, error) {
        // The delete failed.
        // error is a Parse.Error with an error code and message.
        req.flash('message',req.flash('error occured!'));
      }
    });
    res.redirect('/brand');
  });  

//brand edit
app.get('/brand/edit/:id',isLoggedIn,(req,res)=>{
  
    if(req.query.action){
      var Brand = Parse.Object.extend("Brand");
      var query = new Parse.Query(Brand);
      query.get(req.params.id, {
        success: function(brand) {
          // The object was retrieved successfully.
          res.render('brand',{query:req.query.action,Brand:brand});
        },
        error: function(object, error) {
          // The object was not retrieved successfully.
          // error is a Parse.Error with an error code and message.
        }
      });
     
      }
    });
app.post('/brand/edit/:id',isLoggedIn,upload.single('brandpic'),(req,res)=>{
      
          var Brand = Parse.Object.extend("Brand");
          var query = new Parse.Query(Brand);
          query.get(req.params.id, {
            success: function(brand) {
              // The object was retrieved successfully.
              // Now let update it
              brand.set("name", req.body.brandname);
              if(req.file  !== undefined){
                brand.set("url", req.file.path);
              }
              brand.save();
              res.redirect('/brand');
            },
            error: function(object, error) {
              // The object was not retrieved successfully.
              // error is a Parse.Error with an error code and message.
            }
          });
    });


    
app.get('/model',isLoggedIn,function(req,res){
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
      if(req.query.brand){
        //paginations vars
        let page = req.query.page ? (parseInt(req.query.page) -1) : 0;
        //page must be 0 and greater
        page = page < 0 ? 0 : page;
        let per_page_display = req.query.plimit  ? parseInt(req.query.plimit) : 50;
        let total_result;

        var Model  = Parse.Object.extend("Model");
        var Brand  = Parse.Object.extend("Brand");
        var mBrand = Brand.createWithoutData(req.query.brand);
        var query  = new Parse.Query(Model);
        query.equalTo("parent",mBrand);
        //counts result before
          query.count().then((count)=>{
            total_result = count;
          });  
        query.ascending("name");
        query.include("parent");

        //limit & skip
        let limit = per_page_display > total_result ? 100 : per_page_display;
        query.limit(limit);
        query.skip(page * per_page_display);
        query.find({
        success: function(Model) {
          res.render('model',{Models: Model,total_result:total_result,page:page+1,plimit:per_page_display});
        },
        error: function(object, error) {
        // The object was not retrieved successfully.
        // error is a Parse.Error with an error code and message.
        }
        });
      }else
      {
        res.render('model',{query: "model"});
      }
  }
});

app.post('/model/add',isLoggedIn,(req,res)=>{
  var Brand = Parse.Object.extend("Brand");
  // Create a new instance of that class.
  var mBrand = Brand.createWithoutData(req.body.brandid);
  console.log(JSON.stringify(mBrand.get("name")))
  var Model = Parse.Object.extend("Model");
  var mModel = new Model();
  mModel.set("name",req.body.modelname);
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
//model remove
app.get('/model/remove/:id',isLoggedIn,(req,res)=>{
  
    var Model = Parse.Object.extend("Model");
    // Create a new instance of that class.
    var mModel = new Model();
    mModel.id = req.params.id;
    mModel.destroy({
      success: function(mModel) {
        // The object was deleted from the Parse Cloud.
        console.log("Model object delete it's id is"+mModel.id);
        req.flash('message',req.flash('Successfully deleted'));
      },
      error: function(mModel, error) {
        // The delete failed.
        // error is a Parse.Error with an error code and message.
        req.flash('message',req.flash('error occured!'));
      }
    });
    res.redirect('/model');
  });  

//model edit
app.get('/model/edit/:id',isLoggedIn,(req,res)=>{
  
    if(req.query.action){
     
      var Brand = Parse.Object.extend("Brand");
      var mBrand = new Parse.Query(Brand);      
      var myBrand = mBrand.find().then((Brand)=> {
      return Brand;
      });
      var Model = Parse.Object.extend("Model");
      var query = new Parse.Query(Model);
      var myModel = query.get(req.params.id).then((model)=>{
        return model;
      });
      Promise.all([myModel,myBrand]).then(([model,brand])=>{
        res.render('model',{query:req.query.action,Model:model,Brands:brand});
      });
      }
    });

app.post('/model/edit/:id',isLoggedIn,(req,res)=>{
      
          var Model = Parse.Object.extend("Model");
          var query = new Parse.Query(Model);
          query.get(req.params.id, {
            success: function(model) {
              // The object was retrieved successfully.
              var Brand = Parse.Object.extend("Brand");
              // Create a new instance of that class.
              var mBrand = new Brand();
              mBrand.id = req.body.brandid;
              model.set("name",req.body.modelname);
              model.set("parent", mBrand);
              // Now let update it
              model.save();
              res.redirect('/model');
            },
            error: function(object, error) {
              // The object was not retrieved successfully.
              // error is a Parse.Error with an error code and message.
            }
          });
    });

//generations
app.get('/generation/:id',isLoggedIn,function(req,res){
  if(req.query.action){
    var Model = Parse.Object.extend("Model");
    var mModel = new Model();
    mModel.id =  req.params.id;
    var Generation = Parse.Object.extend("Generation");
    var query = new Parse.Query(Generation);
    query.equalTo("model",mModel);
    query.descending("released");
    query.find({
    success: function(Generation) {
      res.render('generation',{query:req.query.action,Generations: Generation,Model: mModel});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
  else{
    var Model = Parse.Object.extend("Model");
    var mModel = new Model();
    var Generation  = Parse.Object.extend("Generation");
    mModel.id = req.params.id;    
    var query = new Parse.Query(Generation);
    query.equalTo("model",mModel);
    query.descending("released");
    query.find({
    success: function(Generation) {
      res.render('generation',{Generations: Generation, Model: mModel});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

app.post('/generation/add',isLoggedIn,upload.single('generationpic'),(req,res)=>{
  var Model = Parse.Object.extend("Model");
  var mModel = new Model();
  mModel.id = req.body.modelid;
  var Generation = Parse.Object.extend("Generation");
  var mGeneration = new Generation();
  mGeneration.set("name",req.body.generationname);
  mGeneration.set("released", req.body.released);
  if(req.file  !== undefined){
    mGeneration.set("url",req.file.path);
  }
  mGeneration.set("model", mModel);
  mGeneration.save(null, {
    success: function(mGeneration) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mGeneration.id);
    },
    error: function(mGeneration, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/generation/'+req.body.modelid);
});

app.get('/generation/remove/:id',isLoggedIn,(req,res)=>{
  
    var Generation = Parse.Object.extend("Generation");
    // Create a new instance of that class.
    var mGeneration = new Generation();
    mGeneration.id = req.params.id;
    mGeneration.destroy({
      success: function(mGeneration) {
        // The object was deleted from the Parse Cloud.
        console.log("Generation object delete it's id is"+mGeneration.id);
        req.flash('message',req.flash('Successfully deleted'));
      },
      error: function(mGeneration, error) {
        // The delete failed.
        // error is a Parse.Error with an error code and message.
        req.flash('message',req.flash('error occured!'));
      }
    });
    res.redirect('back');
  });  


//generation edit
app.get('/generation/edit/:id',isLoggedIn,(req,res)=>{

if(req.query.action){
var Generation = Parse.Object.extend("Generation");
var mGeneration = new Parse.Query(Generation);
var mCurrentGeneration = mGeneration.get(req.params.id).then((gen)=>{
  return gen;
});
return Promise.all([mCurrentGeneration]).then(([current])=>{
  // console.log(model);
  res.render('generation',{query:req.query.action,Generation:current});
});
}
});

app.post('/generation/edit/:id',isLoggedIn,upload.single('generationpic'),(req,res)=>{
var Generation = Parse.Object.extend("Generation");
var query = new Parse.Query(Generation);
query.get(req.params.id, {
  success: function(generation) {
    // The object was retrieved successfully.
    generation.set("name",req.body.generationname);
    generation.set("released", req.body.released);
    if (req.file !== undefined) {
      generation.set("url",req.file.path);
    }
    // Now let update it
    generation.save();
    res.redirect('/generation/'+req.body.modelid);
  },
  error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
  }
});
});

//spares
app.get('/spare',isLoggedIn,function(req,res){
  if(req.query.action == "edit" || req.query.action == "new"){
    var Spare = Parse.Object.extend("Spare");
    var mSpare = new Parse.Query(Spare);
    var Generation = Parse.Object.extend("Generation");
    var mGeneration = new Parse.Query(Generation);
    var Model = Parse.Object.extend("Model");
    var mModel = new Parse.Query(Model);
    var Category = Parse.Object.extend("Category");
    var mCategory = new Parse.Query(Category);

    var mySpare = mSpare.find().then((Spare)=> {
      return Spare;
    });
    var myModel = mModel.find().then((Model)=>{
      return Model;
    })
    var myGeneration = mGeneration.find().then((Generation)=>{
      return Generation;
    });
    var myCategory = mCategory.find().then((Category)=>{
      return Category;
    });
    

    return Promise.all([mySpare,myModel,myGeneration,myCategory]).then(([spare,model,generation,category])=>{
      // console.log(model);
      res.render('spare',{query:req.query.action,Spares: spare,Models:model,Generations:generation,Categories:category});
    });
  }
  else{

    //paginations vars
    let page = req.query.page ? (parseInt(req.query.page) -1) : 0;
    //page must be 0 and greater
    page = page < 0 ? 0 : page;
    let per_page_display = req.query.plimit  ? parseInt(req.query.plimit) : 50;
    let total_result;

    var Spare = Parse.Object.extend("Spare");
    var query = new Parse.Query(Spare);
    
    //counts result before
    //we will optimize it later using redis to store counts instead of pulling from db each time query executed!
    query.count().then((count)=>{
    total_result = count;
    });
    //limit & skip
    let limit = per_page_display > total_result ? 100 : per_page_display;
    query.limit(limit);
    query.skip(page * per_page_display);
    //filter is available
    //category
    if(req.query.category){
      let Category  = Parse.Object.extend("Category");
      let mCategory = Category.createWithoutData(req.query.category);
      query.equalTo("category",mCategory);
    }
    //generation
    if(req.query.generation){
      let Generation = Parse.Object.extend("Generation");
      let mGeneration = Generation.createWithoutData(req.query.generation);
      query.equalTo("generation",mGeneration);
    }
    query.descending("createdAt");
    query.include("generation");
    query.include("generation.model");
    query.include("category");
    query.find({
    success: function(Spare) {
      res.render('spare',{Spares: Spare,total_result:total_result,page:page+1,plimit:per_page_display});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});
//get single spare Details
app.get('/spare/item/:itemId',isLoggedIn,(req,res)=>{
  if(req.query.action == "single" && req.params.itemId){
  var Spare = Parse.Object.extend("Spare");
  var query = new Parse.Query(Spare);
  query.descending("createdAt");
  query.include("generation");
  query.include("generation.model");
  query.include("category");
  query.get(req.params.itemId,{
  success: function(Spare) {
    res.render('spare',{query:req.query.action,spare: Spare});
  },
  error: function(object, error) {
  // The object was not retrieved successfully.
  // error is a Parse.Error with an error code and message.
  }
  });
  }else
  {
    res.json({"status":false});
  }
});
app.post('/spare/add',isLoggedIn,upload.single('sparepic'),(req,res)=>{
  var Spare = Parse.Object.extend("Spare");
  var mSpare = new Spare();

  var Generation = Parse.Object.extend("Generation");
  var mGeneration =Generation.createWithoutData(req.body.generationid);
  var Category = Parse.Object.extend("Category");
  var mCategory = Category.createWithoutData(req.body.categoryid);

  mSpare.set("name",req.body.sparename);
  mSpare.set("quality", req.body.sparequality);
  mSpare.set("quantity", req.body.sparequantity);
  if (req.file !== undefined) {
    mSpare.set("url",req.file.path);
  }
  mSpare.set("price",req.body.spareprice);
  mSpare.set("warranty",req.body.sparewarranty);
  if(req.body.generationid  !== undefined){
    mSpare.set("generation", mGeneration);
  }else
  {
    mSpare.set("generation",null);  
  }
  mSpare.set("category",mCategory);
  if(req.body.sparedesc){
    //nevermind store it as string
    //we will parse it at front ends!
    mSpare.set("description", req.body.sparedesc);
  }
  mSpare.save(null, {
    success: function(mSpare) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mSpare.id);
    },
    error: function(mSpare, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/spare');
});

//spare remove
app.get('/spare/remove/:id',isLoggedIn,(req,res)=>{
  
    var Spare = Parse.Object.extend("Spare");
    // Create a new instance of that class.
    var mSpare = new Spare();
    mSpare.id = req.params.id;
    mSpare.destroy({
      success: function(mSpare) {
        // The object was deleted from the Parse Cloud.
        console.log("Spare object delete it's id is"+mSpare.id);
        req.flash('message',req.flash('Successfully deleted'));
      },
      error: function(mSpare, error) {
        // The delete failed.
        // error is a Parse.Error with an error code and message.
        req.flash('message',req.flash('error occured!'));
      }
    });
    res.redirect('/spare');
  });  

//spare edit
app.get('/spare/edit/:id',isLoggedIn,(req,res)=>{
  
    if(req.query.action){
      var Spare = Parse.Object.extend("Spare");
      var mSpare = new Parse.Query(Spare);
      mSpare.include('generation');
      mSpare.include('generation.model');
      var mCurrentSpare = mSpare.get(req.params.id).then((spare)=>{
        return spare;
      });
      var Generation = Parse.Object.extend("Generation");
      var mGeneration = new Parse.Query(Generation);
      var Model = Parse.Object.extend("Model");
      var mModel = new Parse.Query(Model);
      var Category = Parse.Object.extend("Category");
      var mCategory = new Parse.Query(Category);
  
      var mySpare = mSpare.find().then((Spare)=> {
        return Spare;
      });
      var myModel = mModel.find().then((Model)=>{
        return Model;
      })
      var myGeneration = mGeneration.find().then((Generation)=>{
        return Generation;
      });
      var myCategory = mCategory.find().then((Category)=>{
        return Category;
      });
      return Promise.all([mySpare,myModel,myGeneration,myCategory,mCurrentSpare]).then(([spare,model,generation,category,current])=>{
        // console.log(model);
        res.render('spare',{query:req.query.action,Spares: spare,Models:model,Generations:generation,Categories:category,Spare:current});
      });
      }
    });

app.post('/spare/edit/:id',isLoggedIn,upload.single('sparepic'),(req,res)=>{
          var Spare = Parse.Object.extend("Spare");
          var query = new Parse.Query(Spare);
          query.get(req.params.id, {
            success: function(spare) {
              // The object was retrieved successfully.
              var Generation = Parse.Object.extend("Generation");
              var mGeneration = Generation.createWithoutData(req.body.generationid);
              var Category = Parse.Object.extend("Category");
              var mCategory = Category.createWithoutData(req.body.categoryid);
            
              spare.set("name",req.body.sparename);
              spare.set("quality", req.body.sparequality);
              spare.set("quantity", req.body.sparequantity);
              if(req.file  !== undefined){
                spare.set("url",req.file.path);  
              }
              spare.set("price",req.body.spareprice);
              spare.set("warranty",req.body.sparewarranty);
              //check if generation&model is available and set it
              if(req.body.generationid  !== undefined){
                spare.set("generation", mGeneration);
              }else
              {
                spare.set("generation",null);  
              }
              spare.set("category",mCategory);
              spare.set("description",req.body.sparedesc);
              // Now let update it
              spare.save();
              res.redirect('/spare');
            },
            error: function(object, error) {
              // The object was not retrieved successfully.
              // error is a Parse.Error with an error code and message.
            }
          });
    });


//supplier
app.get('/supplier',isLoggedIn,function(req,res){
  if(req.query.action){
      res.render('supply',{query:req.query.action});
  }
  else{
    var Supplier = Parse.Object.extend("Supplier");
    var query = new Parse.Query(Supplier);
    query.find({
    success: function(Supplier) {
      res.render('supply',{Suppliers: Supplier});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

//suppliers add
app.post('/supplier/add',isLoggedIn,(req,res)=>{
  var Supplier = Parse.Object.extend("Supplier");
  // Create a new instance of that class.
  var mSupplier = new Supplier();
  mSupplier.set("name",req.body.suppliername);
  mSupplier.set("address", req.body.supplieraddress);
  mSupplier.set("phone",req.body.supplierphone);
  mSupplier.save(null, {
    success: function(mSupplier) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mSupplier.id);
    },
    error: function(mSupplier, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/supplier');
});

//supplier remove
app.get('/supplier/remove/:id',isLoggedIn,(req,res)=>{

  var Supplier = Parse.Object.extend("Supplier");
  // Create a new instance of that class.
  var mSupplier = Supplier.createWithoutData(req.params.id);
  mSupplier.destroy({
    success: function(mSupplier) {
      // The object was deleted from the Parse Cloud.
      console.log("Supplier object delete it's id is"+mSupplier.id);
      req.flash('message',req.flash('Successfully deleted'));
    },
    error: function(mSupplier, error) {
      // The delete failed.
      // error is a Parse.Error with an error code and message.
      req.flash('message',req.flash('error occured!'));
    }
  });
  res.redirect('/supplier');
});

//supplier edit
app.get('/supplier/edit/:id',isLoggedIn,(req,res)=>{

  if(req.query.action){
    var Supplier = Parse.Object.extend("Supplier");
    var query = new Parse.Query(Supplier);
    query.get(req.params.id, {
      success: function(supplier) {
        // The object was retrieved successfully.
        res.render('supply',{query:req.query.action,Supplier:supplier});
      },
      error: function(object, error) {
        // The object was not retrieved successfully.
        // error is a Parse.Error with an error code and message.
      }
    });
   
    }
  });
app.post('/supplier/edit/:id',isLoggedIn,(req,res)=>{
    
        var Supplier = Parse.Object.extend("Supplier");
        var query = new Parse.Query(Supplier);
        query.get(req.params.id, {
          success: function(supplier) {
            // The object was retrieved successfully.
            // Now let update it
            supplier.set("name", req.body.suppliername);
            supplier.set("address", req.body.supplieraddress);
            supplier.set("phone", req.body.supplierphone);
            supplier.save();
            res.redirect('/supplier');
          },
          error: function(object, error) {
            // The object was not retrieved successfully.
            // error is a Parse.Error with an error code and message.
          }
        });
  });
  

//add contacts routes
//get contacts
app.get('/contacts',isLoggedIn,function(req,res){
  if(req.query.action){
      res.render('contacts',{query:req.query.action});
  }
  else{
    var Contact = Parse.Object.extend("Contact");
    var query = new Parse.Query(Contact);
    query.find({
    success: function(Contact) {
      res.render('contacts',{Contacts: Contact});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

//suppliers add
app.post('/contacts/add',isLoggedIn,(req,res)=>{
  var Contact = Parse.Object.extend("Contact");
  // Create a new instance of that class.
  var mContact = new Contact();
  mContact.set("website",req.body.contactwebsite);
  mContact.set("email", req.body.contactemail);
  mContact.set("phone", req.body.contactphone);
  mContact.set("lat",req.body.contactlatitude);
  mContact.set("long",req.body.contactlongitude);
  mContact.save(null, {
    success: function(mContact) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mContact.id);
    },
    error: function(mContact, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/contacts');
});

//supplier remove
app.get('/contacts/remove/:id',isLoggedIn,(req,res)=>{

  var Contact = Parse.Object.extend("Contact");
  // Create a new instance of that class.
  var mContact = Contact.createWithoutData(req.params.id);
  mContact.destroy({
    success: function(mContact) {
      // The object was deleted from the Parse Cloud.
      console.log("Contact object delete it's id is"+mContact.id);
      req.flash('message',req.flash('Successfully deleted'));
    },
    error: function(mContact, error) {
      // The delete failed.
      // error is a Parse.Error with an error code and message.
      req.flash('message',req.flash('error occured!'));
    }
  });
  res.redirect('/contacts');
});

//supplier edit
app.get('/contacts/edit/:id',isLoggedIn,(req,res)=>{

  if(req.query.action){
    var Contact = Parse.Object.extend("Contact");
    var query = new Parse.Query(Contact);
    query.get(req.params.id, {
      success: function(contact) {
        // The object was retrieved successfully.
        res.render('contacts',{query:req.query.action,Contact:contact});
      },
      error: function(object, error) {
        // The object was not retrieved successfully.
        // error is a Parse.Error with an error code and message.
      }
    });
   
    }
  });
app.post('/contacts/edit/:id',isLoggedIn,(req,res)=>{
    
        var Contact = Parse.Object.extend("Contact");
        var query = new Parse.Query(Contact);
        query.get(req.params.id, {
          success: function(contact) {
            // The object was retrieved successfully.
            // Now let update it
            contact.set("website",req.body.contactwebsite);
            contact.set("email", req.body.contactemail);
            contact.set("phone", req.body.contactphone);
            contact.set("long",req.body.contactlongitude);
            contact.set("lat",req.body.contactlatitude);
            contact.save();
            res.redirect('/contacts');
          },
          error: function(object, error) {
            // The object was not retrieved successfully.
            // error is a Parse.Error with an error code and message.
          }
        });
  });

//ends of contacts routes
//category
app.get('/category',isLoggedIn,function(req,res){
  if(req.query.action){
      res.render('category',{query:req.query.action});
  }
  else{
    var Category = Parse.Object.extend("Category");
    var query = new Parse.Query(Category);
    query.find({
    success: function(Category) {
      res.render('category',{Categories: Category});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

//suppliers add
app.post('/category/add',isLoggedIn,(req,res)=>{
  var Category = Parse.Object.extend("Category");
  // Create a new instance of that class.
  var mCategory = new Category();
  mCategory.set("name",req.body.categoryname);
  mCategory.set("order", req.body.order);
  mCategory.save(null, {
    success: function(mCategory) {
      // Execute any logic that should take place after the object is saved.
      console.info('New object created with objectId: ' + mCategory.id);
    },
    error: function(mCategory, error) {
      // Execute any logic that should take place if the save fails.
      // error is a Parse.Error with an error code and message.
      console.error('Failed to create new object, with error code: ' + error.message);
    }
  });
  res.redirect('/category');
});

//category remove
app.get('/category/remove/:id',isLoggedIn,(req,res)=>{
  
    var Category = Parse.Object.extend("Category");
    // Create a new instance of that class.
    var mCategory = Category.createWithoutData(req.params.id);
    mCategory.destroy({
      success: function(mCategory) {
        // The object was deleted from the Parse Cloud.
        console.log("Category object delete it's id is"+mCategory.id);
        req.flash('message',req.flash('Successfully deleted'));
      },
      error: function(mCategory, error) {
        // The delete failed.
        // error is a Parse.Error with an error code and message.
        req.flash('message',req.flash('error occured!'));
      }
    });
    res.redirect('/category');
  });  

//category edit
app.get('/category/edit/:id',isLoggedIn,(req,res)=>{
  
    if(req.query.action){
      var Category = Parse.Object.extend("Category");
      var query = new Parse.Query(Category);
      query.get(req.params.id, {
        success: function(category) {
          // The object was retrieved successfully.
          res.render('category',{query:req.query.action,Category:category});
        },
        error: function(object, error) {
          // The object was not retrieved successfully.
          // error is a Parse.Error with an error code and message.
        }
      });
      }
    });
app.post('/category/edit/:id',isLoggedIn,(req,res)=>{
      
          var Category = Parse.Object.extend("Category");
          var query = new Parse.Query(Category);
          query.get(req.params.id, {
            success: function(category) {
              // The object was retrieved successfully.
              // Now let update it
              category.set("name", req.body.categoryname);
              category.set("order",req.body.order);
              category.save();
              res.redirect('/category');
            },
            error: function(object, error) {
              // The object was not retrieved successfully.
              // error is a Parse.Error with an error code and message.
            }
          });
    });

//orders
app.get('/order',isLoggedIn,function(req,res){
  if(req.query.action){
      res.render('order',{query:req.query.action});
  }
  else{
    //paginations vars
    let page = req.query.page ? (parseInt(req.query.page) -1) : 0;
    //page must be 0 and greater
    page = page < 0 ? 0 : page;
    let per_page_display = req.query.plimit  ? parseInt(req.query.plimit) : 50;
    let total_result;

    var Order = Parse.Object.extend("Order");
    var query = new Parse.Query(Order);
    //counts result before
    query.count().then((count)=>{
        total_result = count;
    });  
    //limit & skip
    let limit = per_page_display > total_result ? 100 : per_page_display;
    query.limit(limit);
    query.skip(page * per_page_display);
    query.descending("createdAt");
    query.find({
    success: function(Order) {
      res.render('order',{Orders: Order,total_result:total_result,page:page+1,plimit:per_page_display});
    },
    error: function(object, error) {
    // The object was not retrieved successfully.
    // error is a Parse.Error with an error code and message.
    }
    });
  }
});

//order items
app.get('/order/items/:id',isLoggedIn,(req,res)=>{
  
      var Order = Parse.Object.extend("Order");
      var query = new Parse.Query(Order);
      query.get(req.params.id, {
        success: function(order) {
          // The object was retrieved successfully.
          res.render('order',{query:req.query.action,Order: order});
        },
        error: function(object, error) {
          // The object was not retrieved successfully.
          // error is a Parse.Error with an error code and message.
        }
      });
});

//notifications
app.get('/notifications',isLoggedIn,(req,res)=>{
  res.render('notifications');
});

//simple API End Points

//getting generations for specified model id
app.get('/api/generations/:model_id',(req,res)=>{
  var Generation = Parse.Object.extend("Generation");
  var Model = Parse.Object.extend("Model");
  var query = new Parse.Query(Generation);
  var model = Model.createWithoutData(req.params.model_id);
  query.equalTo("model",model);
  query.include("model");
  query.include("generation");
  query.include("generation.model");
  query.include("category");
  query.find({
  success: function(Spare) {
    res.json(Spare);
  },
  error: function(object, error) {
  // The object was not retrieved successfully.
  // error is a Parse.Error with an error code and message.
  }
  }); 
});
//getting models
app.get('/api/models/:brand_id',function(req,res){
  var Brand = Parse.Object.extend("Brand");
  var Model = Parse.Object.extend("Model");
  var brand = Brand.createWithoutData(req.params.brand_id);

  var query = new Parse.Query(Model);
  query.equalTo("parent",brand);
  query.include("parent");
  query.find({
  success: function(Model) {
    res.json(Model);
  },
  error: function(object, error) {
  // The object was not retrieved successfully.
  // error is a Parse.Error with an error code and message.
  }
  });
});


//getting brands
app.get('/api/brands',function(req,res){
  var Brand = Parse.Object.extend("Brand");
  var query = new Parse.Query(Brand);
  query.find({
  success: function(Brand) {
    res.json(Brand);
  },
  error: function(object, error) {
  // The object was not retrieved successfully.
  // error is a Parse.Error with an error code and message.
  }
  });
});

//getting categories
app.get('/api/categories',function(req,res){
  var Category = Parse.Object.extend("Category");
  var query = new Parse.Query(Category);
  query.find({
  success: function(Category) {
    res.json(Category);
  },
  error: function(object, error) {
  // The object was not retrieved successfully.
  // error is a Parse.Error with an error code and message.
  }
  });
});

// There will be a test page available on the /test path of your server url
// Remove this before launching your app
// app.get('/test', function(req, res) {
//   res.sendFile(path.join(__dirname, '/public/test.html'));
// });

var port = process.env.PORT || 1337;
var httpServer = require('http').createServer(app);
var io = require('socket.io')(httpServer);
//setting up WebSocket Connection
io.on('connection',(socket)=>{
  console.log('A Socket Connection Now Open!');
  // console.log(socket);
  rclient.on("message",(channel,message)=>{
    //getting total notifications & array containing notifications & last notification
    let notifications = 0;
    let notificationsArr = [];
    r2client.multi()
    .get("notifications",function(err,reply){
      if(reply){
        // console.log("let me see => "+reply);
        notifications = reply; 
      }
    })
    .lrange("recent-notifications", 0, -1, function(err, reply) {
      if(reply){
        // console.log("before push show me wt u got! =>"+reply);
        notificationsArr = reply;
      }
    }).exec(()=>{
      socket.emit('from-server',{
        channel: channel,
        message: JSON.parse(message),
        counts: notifications,
        notifications: notificationsArr
        });
    });
  });
  socket.on('from-client',(DeletedOrder)=>{
      //stringify it to equal to the format stored in redis
      let content = JSON.stringify(DeletedOrder);
      r2client.multi()
      .lrem("recent-notifications",0,content,function(){
      console.log("User Viewed => "+content);
      })
      .decr("notifications")
      .exec();
  });
});
//endpoints to retrieve notifcations datas on notification page
app.get('/api/notifications',function(req,res){
      //getting total notifications & array containing notifications & last notification
      let notifications = 0;
      let notificationsArr = [];
      r2client.multi()
      .get("notifications",function(err,reply){
        if(reply){
          // console.log("let me see => "+reply);
          notifications = reply; 
        }
      })
      .lrange("recent-notifications", 0, -1, function(err, reply) {
        if(reply){
          // console.log("before push show me wt u got! =>"+reply);
          notificationsArr = reply;
        }
      }).exec(()=>{
        res.json({
          counts: notifications,
          notifications: notificationsArr
          });
      });
});

httpServer.listen(port, function() {
    console.log('otobox backend is running on port ' + port + '.');
});

// This will enable the Live Query real-time server
ParseServer.createLiveQueryServer(httpServer);
