var redis   = require('redis');
var rclient = redis.createClient(process.env.REDIS_PORT,process.env.REDIS_HOST);

// Parse.Cloud.define('hello', function(req, res) {
//   res.success('Hi');
// });

//cleanup whenever to delete Brand 
Parse.Cloud.afterDelete("Brand", function(request) {
  var query = new Parse.Query("Model");
  query.equalTo("parent", request.object);

  query.find().then(function(models) {
    return Parse.Object.destroyAll(models);
  }).then(function(success) {
    // The related models were deleted
    console.log("Associated models deleted successful");    
  }, function(error) {
    console.error("Error deleting related comments " + error.code + ": " + error.message);
  });
});

//cleanup whenever you delete model

Parse.Cloud.afterDelete("Model", function(request) {
  var query = new Parse.Query("Spare");
  query.equalTo("model", request.object);

  query.find().then(function(spares) {
    return Parse.Object.destroyAll(spares);
  }).then(function(success) {
    // The related spares were deleted
    console.log("Associated Spares deleted successful");    
  }, function(error) {
    console.error("Error deleting related comments " + error.code + ": " + error.message);
  });
});

//cleanup whenever you delete generation
Parse.Cloud.afterDelete("Generation", function(request) {
  var query = new Parse.Query("Spare");
  query.equalTo("generation", request.object);

  query.find().then(function(spares) {
    return Parse.Object.destroyAll(spares);
  }).then(function(success) {
    // The related spares were deleted
    console.log("Associated Spares deleted successful");
  }, function(error) {
    console.error("Error deleting related comments " + error.code + ": " + error.message);
  });
});

//cleanup whenever you delete category
Parse.Cloud.afterDelete("Category", function(request) {
  var query = new Parse.Query("Spare");
  query.equalTo("category", request.object);

  query.find().then(function(spares) {
    return Parse.Object.destroyAll(spares);
  }).then(function(success) {
    // The related spares were deleted
    console.log("Associated Spares deleted successful");
  }, function(error) {
    console.error("Error deleting related comments " + error.code + ": " + error.message);
  });
});

Parse.Cloud.afterSave("Order", function(request) {
  var Order = Parse.Object.extend("Order");
  // Create a new instance of that class.
  //var mOrder = Order.createWithoutData(request.object.id);
  // console.log(JSON.stringify(request.object));
  // console.log("object Id =>"+request.object.id);
  // console.log(request.object.get("names"));
  let notifications = {
    orderId : request.object.id,
    from : request.object.get('names'),
    phone : request.object.get('phone'),
    amounts: request.object.get('amount'),
    createdAt: request.object.createdAt
  }
  console.log(JSON.stringify(notifications));
  rclient.multi()
  .lpush("recent-notifications",JSON.stringify(notifications))
  .ltrim("recent-notifications", 0, 99)
  .incr("notifications")
  .publish("otobox:notifications",JSON.stringify(notifications))
  .exec();
});