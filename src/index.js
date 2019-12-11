/**
 * Node.js Web Application Template
 * 
 * The code below serves as a starting point for anyone wanting to build a
 * website using Node.js, Express, Handlebars, and MySQL. You can also use
 * Forever to run your service as a background process.
 */
const express = require('express');
const exphbs = require('express-handlebars');

const session = require('express-session');

const mysql = require('mysql');
const path = require('path');
const bodyParser = require("body-parser");
const async = require("async");

const app = express();

// Configure handlebars
const hbs = exphbs.create({
  defaultLayout: 'main',
  extname: '.hbs'
});

//Configure sessions
const options = {
  store: this.store, // Default is memoryStore, which is for dev only. Setup redis or memcached for prod
  secret: 'secret', // Required, used to sign session id cookie
  saveUninitialized: true, // Forces a session that is "uninitialized" to be saved to the store
  resave: false, //Forces the session to be saved back to the session store
  rolling: true //Force a session identifier cookie to be set on every response
};

const middleware = session(options);

// Configure the views
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(path.basename(__dirname), 'views'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(middleware);

// Setup static content serving
app.use(express.static(path.join(path.basename(__dirname), 'public')));

/**
 * Create a database connection. This is our middleware function that will
 * initialize a new connection to our MySQL database on every request.
 */
const config = require('./config');

function connectDb(req, res, next) {
  console.log('Connecting to the database');
  let connection = mysql.createConnection(config);
  connection.connect();
  req.db = connection;
  console.log('Database connected');
  next();
}

/*
Function to get session variables for response.
*/

function getResponse(req) {
  var response;

  if (req.session.username) {
    var response = {username: req.session.username, firstName: req.session.firstName, lastName: req.session.lastName, cart: req.session.cart};
  }
  else if (req.session.suppliername) {
    var response = {suppliername: req.session.suppliername};
  }
  console.log('Response:', response);
  return response;
}

/*
Function to remove session user variables
*/

function deleteSession(req) {
  delete req.session.username;
  delete req.session.firstName;
  delete req.session.lastName;
  delete req.session.suppliername;
  delete req.session.cart;
}

/**
 * This is the handler for our main page. The middleware pipeline includes
 * our custom `connectDb()` function that creates our database connection and
 * exposes it as `req.db`.
 */
app.get('/', connectDb, function(req, res, next) {
  console.log('---Got request for the home page---');

  //info('Rendering all the products');
  var select = 'SELECT P.productID, P.productName, P.category, P.description, P.supplierName, MAX(price) AS price, SUM(itemsOrdered) AS numBought ';
  var from = 'FROM Products P LEFT JOIN Catalog C ON P.productID = C.productID LEFT JOIN ItemsinOrder I ON C.catalogID = I.catalogID ';
  var query = select + from +'GROUP BY P.productID ORDER BY numBought DESC LIMIT 4';
  req.db.query(query, function(err, products) {
    if (err) return next(err);
    for (var i = 0; i < products.length; i++) {
      products[i].price = products[i].price.toFixed(2);
      if (products[i].numBought == null) products[i].numBought = 0;
      if (products[i].numAvailable == null) products[i].numAvailable = 0;
    }
    var response = getResponse(req);
    res.render('home', Object.assign({products},response));
    close(req);
  });
});

app.get('/browse', connectDb, function(req, res) {
  console.log('---Got request for the browse page---');

  var select = 'SELECT P.productID, P.productName, P.category, P.description, P.supplierName, MAX(price) AS price, SUM(numberOfEntries) AS numAvailable ';
  var from = 'FROM Products P LEFT JOIN Catalog C ON P.productID = C.productID LEFT JOIN ItemsinOrder I ON C.catalogID = I.catalogID ';
  var query = select + from +'GROUP BY P.productID HAVING numAvailable > 0 ORDER BY P.category, price DESC';
  req.db.query(query, function(
    err,
    products
  ) {
    if (err) return next(err);
    var response = getResponse(req);
    for (var i = 0; i < products.length; i++) {
      products[i].price = products[i].price.toFixed(2); //Convert price to have two decimal points
    }
    res.render('browse', Object.assign({products}, response));
    close(req);
  });
});

app.get('/specificProduct/:id', connectDb, function(req, res, next) {
  let id = req.params.id
  req.db.query('SELECT P.productName, P.description, P.supplierName, P.category FROM Products P WHERE productID = ?', [id], function(err, productDetails) {
    if (err) return next(err);
    if (productDetails.length === 0) {
      info(`Product with id ${id} not found`);
    } else {
      var response = getResponse(req);
      res.render('specificProduct', Object.assign({productDetails}, response));
    }
    close(req);
  });
});

app.get('/cart', connectDb, function(req, res) {

  console.log('---Got request for the cart page');
  var allProducts = [];
  var response = getResponse(req);
  var query = 'SELECT P.productID, P.productName, P.description, P.supplierName, P.category, C.price FROM Products P, Catalog C WHERE P.productID = ? AND P.productID = C.productID';
 
  async.forEach(response.cart, function(value, next) {
    var productID = value;
    req.db.query(query,[productID], function(err, product) {
     
      if(err) next(err);
      allProducts.push(product[0]);
      next();
    })
  }, function(err) {
    if(err) throw err;
    console.log(allProducts);
    res.render('cart', {allProducts});
    close(req);
  });
});
 
 /* for(var i = 0; i < response.cart.length; i++) {
    var productID = response.cart[i];
    req.db.query(query,[productID],function(err, product) {
      if(err){
        console.log('Error accesing DB');
        throw(err);
      }else{
        allProducts.push(product[0]);
        console.log(allProducts);
      }
    });
  }
  res.render('cart', Object.assign( {allProducts}, response));
  close(req);
});
*/
app.post('/specificProduct/:id', connectDb, function(req, res) {
  let id = req.params.id;
  if(req.session.cart == null){
    req.session.cart = [];
  }
  req.session.cart.push(id);
  res.render('cart-message');
  close(req);
});

//Handler for customer page
app.get('/customer', connectDb, function(req, res) {
  console.log('---Got request for the customer page---');

  if (req.session.username) {
    var query = 'SELECT Orders.orderID, totalCost, datePurchased FROM Orders WHERE accountName = ? ORDER BY datePurchased';
    req.db.query(query, [req.session.username], function(err, order) {
      if (err) {
        console.log('ERROR: DB connection failed');
        throw err;
      }
      //The following uses the async library to make sure all of the items in the orders are collected before finishing the whole query.
      var orderInner = [];
      var innerQuery = 'SELECT P.productName, C.price, I.itemsOrdered, P.supplierName FROM ItemsinOrder I INNER JOIN Catalog C ON I.catalogID = C.catalogID INNER JOIN Products P ON C.productID = P.productID WHERE I.orderID = ?';
      async.forEachOf(order, function(value, key, callback) {
        req.db.query(innerQuery, [value.orderID], function(err, orderItems) {
          if (err) throw err;
          orderInner[key] = orderItems;
          callback();
        })
      }, function(err) {
        for (var i = 0; i < order.length; i++) {
          order[i].datePurchased = order[i].datePurchased.toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric"});
          order[i].totalCost = order[i].totalCost.toFixed(2);
          order[i].orderItems = orderInner[i];
        }
        var response = getResponse(req);
        res.render('customer', Object.assign({order}, response));
        close(req);
      });
    })
  }
  else {
    var response = getResponse(req);
    res.render('customer', response);
  }
});

//Handler for supplier page
app.get('/supplier', connectDb, function(req, res) {
  console.log('---Got request for the supplier page---');

  if (req.session.suppliername) {
    var select = 'SELECT P.productID, P.productName, P.category, P.description, P.supplierName, SUM(numberOfEntries) AS numAvailable, SUM(itemsOrdered) AS numBought ';
    var from = 'FROM Products P LEFT JOIN Catalog C ON P.productID = C.productID LEFT JOIN ItemsinOrder I ON C.catalogID = I.catalogID ';
    var query = select + from +'WHERE P.supplierName = ? GROUP BY P.productID ORDER BY P.productID DESC';
    req.db.query(query, [req.session.suppliername], function(err, data) {
      if (err) {
        console.log('ERROR: DB connection failed');
        throw err;
      }
      if (data.length === 0)
        data = false;
      
      for (var i = 0; i < data.length; i++) {
        if (data[i].numBought == null) data[i].numBought = 0;
        if (data[i].numAvailable == null) data[i].numAvailable = 0;
      }
      var response = getResponse(req);
      res.render('supplier', Object.assign({data}, response));
      close(req);
    })
  }
  else {
    var response = getResponse(req);
    res.render('supplier', response);
  }
});

//Handler for supplier-product page
app.get('/supplier-product', connectDb, function(req, res, next) {
  console.log('---Got request for the supplier-product page---');

  if (req.session.suppliername) {
    var select = 'SELECT P.productID, P.productName, P.category, P.description, P.supplierName, (SELECT MAX(price) FROM Catalog WHERE productID = 5 AND numberOfEntries > 0) AS maxPrice, SUM(numberOfEntries) AS numAvailable, SUM(itemsOrdered) AS numBought ';
    var from = 'FROM Products P LEFT JOIN Catalog C ON P.productID = C.productID LEFT JOIN ItemsinOrder I ON C.catalogID = I.catalogID ';
    var sql = select + from +'WHERE P.supplierName = ? AND P.productID = ? GROUP BY P.productID';
    req.db.query(sql, [req.session.suppliername, req.query.id], function(err, data) {
      if (err) return next(err);
      console.log(data);
      if (data.length === 0) {
        close(req);
      } else {
        var innerQuery = 'SELECT C.catalogID, C.price, C.numberOfEntries, C.productID FROM Catalog C WHERE productID = ? AND numberOfEntries > 0 ORDER BY price DESC';
        req.db.query(innerQuery, [data[0].productID], function(err, catalogItems) {
          if (err) throw err;

          if (data[0].numBought == null) data[0].numBought = 0;
          if (data[0].numAvailable == null) data[0].numAvailable = 0;
          
          for (var i = 0; i < catalogItems.length; i++) {
            if (catalogItems[i].price < data[0].maxPrice) catalogItems[i].notSold = true
            catalogItems[i].price = catalogItems[i].price.toFixed(2);
          }

          var response = getResponse(req);
          res.render('supplier-product', Object.assign(data[0], response, {catalogItems}));
          close(req);
        })
      }
    });
  }
  else {
    res.render('supplier-product');
    close(req);
  }
});

//Handler for new product page
app.get('/supplier-newproduct', connectDb, function(req, res, next) {
  console.log('---Got request for the supplier-product page---');

  var response = getResponse(req);
  res.render('supplier-newproduct', response);
  close(req);
});

//Handler for login page
app.get('/login', connectDb, function(req, res) {
  console.log('---Got request for the login page---');

  console.log('current user: ', req.session.username);
  console.log('current supplier: ', req.session.suppliername);

  var response = getResponse(req);
  res.render('login', response);

  close(req);
});

//Handler for signup page
app.get('/signup', connectDb, function(req, res) {
  console.log('---Got request for the signup page---');

  var response = getResponse(req);
  res.render('signup', response);

  close(req);
});

/*
  POST submission handlers
*/

//Handler for making the numEntries from a catalog entry 0
app.post('/supplier-deletecatalog', connectDb, function(req, res) {
  console.log('---Got request for removing entries from a catalog entry---');

  if (req.session.suppliername) {
    var sqlquery = 'UPDATE Catalog SET numberOfEntries = ? WHERE catalogID = ?';
    req.db.query(sqlquery, ['0', req.body.catalogID], function (err, result) {
      if (err) throw err;

      close(req);
      res.redirect('/supplier-product?id=' + req.body.productID);
    })
  }
  else close(req);
});

//Handler for new catalog entry POST submission
app.post('/supplier-newcatalog', connectDb, function(req, res) {
  console.log('---Got request for a new catalog entry---');

  if (req.session.suppliername) {
    var sqlquery = 'INSERT INTO Catalog (price, numberOfEntries, productID) VALUES (?, ?, ?)';
    req.db.query(sqlquery, [req.body.newprice, req.body.numentries, req.body.productID], function (err, result) {
      if (err) throw err;

      close(req);
      res.redirect('/supplier-product?id=' + req.body.productID);
    })
  }
  else close(req);
});

//Handler for newprduct POST submission
app.post('/supplier-newproduct', connectDb, function(req, res) {
  console.log('---Got request for new product---');
  
  if (req.session.suppliername) {
    var sqlquery = 'INSERT INTO Products (productName, category, description, supplierName) VALUES (?, ?, ?, ?)';
    req.db.query(sqlquery, [req.body.newname, req.body.category, req.body.newdescription, req.session.suppliername], function(err, result) {
      if (err) throw err;

      if (result.affectedRows > 0) {
        close(req);
        res.redirect('/supplier');
      }
    })
  }
});

//Handler for login POST submission
app.post('/login', connectDb, function(req, res) {
  console.log('---Got request for login action---');
  //Log in as user
  if (req.body.username) {
    req.db.query('SELECT accountName, password, firstName, lastName FROM Customer WHERE accountName = ?', [req.body.username], function(err, data) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }

        if(data.length == 0 || data[0].password != req.body.password)
        res.render('login', {'message': 'Username not found/Password incorrect'});
        else {
          console.log('Login successful');
          //Delete previous session
          deleteSession(req);

          req.session.username = data[0].accountName;
          req.session.firstName = data[0].firstName;
          req.session.lastName = data[0].lastName;

          var response = getResponse(req);

          console.log(req.session.username + ' logged in');
          res.render('login-action', response);
        }
        close(req);
    })
  }
  //Log in as company
  else if (req.body.companyname) {
    req.db.query('SELECT supplierName, password FROM Suppliers WHERE supplierName = ?', [req.body.companyname], function(err, data) {
      if (err) {
        console.log('ERROR: DB connection failed');
        throw err;
      }

      if(data.length == 0 || data[0].password != req.body.password)
        res.render('login', {'message': 'Company name not found/Password incorrect'});
      else {
        console.log('Login successful');
        //Delete previous session
        deleteSession(req);

        req.session.suppliername = data[0].supplierName;

        var response = getResponse(req);

        console.log(req.session.username + ' logged in');
        res.render('login-action', response);
      }
      close(req);
    })
  }
});

//Handler for signup POST submission
app.post('/signup-customer', connectDb, function(req, res) {
  console.log('---Got request for signup-customer action---');

  console.log(req.body);

  //Find if username is in use
  console.log('Search for ' + req.body.username + ' in the user DB');
  var selectQuery = 'SELECT accountName FROM Customer WHERE accountName = ?';
  req.db.query(selectQuery, [req.body.username], function(err, data) {
    if (err) {
      console.log('ERROR: DB connection failed');
      throw err;
    }

    //If so add to DB
    if (data.length == 0) {
      console.log('Adding user to DB');
      var insertQuery = 'INSERT INTO Customer (accountName, password, firstName, lastName) VALUES (?, ?, ? ,?)';
      req.db.query(insertQuery, [req.body.username, req.body.password, req.body.firstname, req.body.lastname], function(err, result) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }
        //Delete previous session
        deleteSession(req);
        //Add user to new new session
        req.session.username = req.body.username;
        req.session.firstName = req.body.firstname;
        req.session.lastName = req.body.lastname;
        //Send session variables as response
        var response = getResponse(req);

        res.render('signup-action', response);
      })
      close(req);
    }
    else {
      res.render('signup', {'message': 'Account name already in use - Please try a different name'})
    }
  })
});

app.post('/signup-supplier', connectDb, function(req, res) {
  console.log('---Got request for signup-supplier action---');

  var selectQuery = 'SELECT supplierName FROM Suppliers WHERE supplierName = ?';
  req.db.query(selectQuery, [req.body.companyname], function(err, data) {
    if (err) {
      console.log('ERROR: DB connection failed');
      throw err;
    }

    //If so add to DB
    if (data.length == 0) {
      console.log('Adding company to DB');
      var insertQuery = 'INSERT INTO Suppliers (supplierName, password) VALUES (?, ?)';
      req.db.query(insertQuery, [req.body.companyname, req.body.password], function(err, result) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }
        //Delete previous session
        deleteSession(req);
        //Add user to new new session
        req.session.suppliername = req.body.companyname;
        //Send session variables as response
        var response = getResponse(req);

        res.render('signup-action', response);
      })
      close(req);
    }
    else {
      res.render('signup', {'message': 'Account name already in use - Please try a different name'});
      close(req);
    }
  })
});

//Handler for logout
app.get('/logout',(req,res) => {
  req.session.destroy((err) => {
      if(err) {
          return console.log(err);
      }
      res.redirect('/');
  });
});

/**
 * Handle all of the resources we need to clean up. In this case, we just need 
 * to close the database connection.
 * 
 * @param {Express.Request} req the request object passed to our middleware
 */
function close(req) {
  if (req.db) {
    req.db.end();
    req.db = undefined;
    console.log('Database connection closed');
  }
}
/**
 * Capture the port configuration for the server. We use the PORT environment
 * variable's value, but if it is not set, we will default to port 3945.
 */

const port = process.env.PORT || 57869;

/**
 * Start the server.
 */
app.listen(port, function() {
  console.log('== Server is listening on port', port);
});
