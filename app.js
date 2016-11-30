const builder = require('botbuilder');
const restify = require('restify');
const passport = require('passport-restify');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const expressSession = require('express-session');
const crypto = require('crypto');
const querystring = require('querystring');
var emoji = require('node-emoji');
require('dotenv').config();

var telemetryModule = require('./telemetry-module.js');
var appInsights = require("applicationinsights");
appInsights.setup(process.env.APPINSIGHTS_INSTRUMENTATIONKEY).start();
var appInsightsClient = appInsights.getClient();

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3979, function () {
  console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD,
  gzipData: true
});
var bot = new builder.UniversalBot(connector, {
    persistConversationData: true
});

server.post('/api/messages', connector.listen());
server.get('/', restify.serveStatic({
  'directory': __dirname,
  'default': 'index.html'
}));

//=========================================================
// Auth Setup
//=========================================================

server.use(restify.queryParser());
server.use(restify.bodyParser());
server.use(expressSession({ secret: 'keyboard cat', resave: true, saveUninitialized: false }));
server.use(passport.initialize());

server.get('/login', function (req, res, next) {
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login', customState: req.query.address, resourceURL: process.env.MICROSOFT_RESOURCE_GRAPH }, 
    function (err, user, info) {
      if (err) {
        console.log(err);
        return next(err);
      }
      if (!user) {
        return res.redirect('/login');
      }
      req.logIn(user, function (err) {
        if (err) {
          return next(err);
        } else {
          return res.send('Welcome ' + req.user.displayName);
        }
      });
    })(req, res, next);
});

server.get('/api/OAuthCallback/',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login', resourceURL: process.env.MICROSOFT_RESOURCE_GRAPH }),
  (req, res) => {
    const address = JSON.parse(req.query.state);
    const magicCode = crypto.randomBytes(4).toString('hex');
    const messageData = { magicCode: magicCode, accessToken: req.authInfo.accessToken, refreshToken: req.authInfo.refreshToken, name: req.user.displayName };
    
    var continueMsg = new builder.Message().address(address).text(JSON.stringify(messageData));

    bot.receive(continueMsg.toMessage());
    res.send('Welcome ' + req.user.displayName + '! Please copy this number and paste it back to your chat so your authentication can complete: ' + magicCode);
});

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(id, done) {
  done(null, id);
});

let strategy = {
  redirectUrl: process.env.AUTHBOT_CALLBACKHOST +'/api/OAuthCallback',
  realm: process.env.MICROSOFT_REALM,
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  validateIssuer: false,
  allowHttpForRedirectUrl: true,
  issuer: null,
  identityMetadata: 'https://login.microsoftonline.com/' + process.env.MICROSOFT_REALM + '/.well-known/openid-configuration',
  skipUserProfile: true,
  scope: null,
  loggingLevel: 'error',
  nonceLifetime: null,
  responseType: 'code id_token',
  responseMode: 'query',
  passReqToCallback: true,
};

passport.use(new OIDCStrategy(strategy,
  (req, iss, sub, profile, accessToken, refreshToken, done) => {
    if (!profile.oid) {
      return done(new Error("No oid found"), null);
    }
    // asynchronous verification, for effect...
    process.nextTick(() => {
      var tokens = { accessToken: accessToken, refreshToken: refreshToken };
      return done(null, profile, tokens);
    });
  }
));

//=========================================================
// Bots Dialogs
//=========================================================

function login(session) {
  var telemetryData = telemetryModule.createTelemetry(session);
  appInsightsClient.trackEvent("botLaunched", telemetryData);

  // Generate signin link
  const address = session.message.address;

  // TODO: Encrypt the address string
  const link = process.env.AUTHBOT_CALLBACKHOST + '/login?address=' + querystring.escape(JSON.stringify(address));

  var msg = new builder.Message(session) 
    .attachments([ 
        new builder.SigninCard(session) 
            .text("Let's get started! " + emoji.get('smiley') + "\n\nPlease sign-in below...") 
            .button("Sign-In", link) 
    ]); 
  session.send(msg);

  builder.Prompts.text(session, "You must first sign into your account.");
}

// Dialogs
var Account = require('./account');
var Winwire = require('./winwire');
var Logout = require('./logout');
var backToMenu = require('./backToMenu');

// Setup dialogs
bot.dialog('/account', Account.Dialog);
bot.dialog('/winwire', Winwire.Dialog);
bot.dialog('/logout', Logout.Dialog);
bot.dialog('/backToMenu', backToMenu.Dialog);

bot.dialog('signin', [
  (session, results) => {
    session.endDialog();
  }
]);

bot.dialog('/', [
  (session, args, next) => {
    if (!session.userData.userName) {
      session.beginDialog('signinPrompt');
    } else {
      next();
    }
  },
  (session, results, next) => {
    if (session.userData.userName) {  // They're logged in
    
      var data = 'grant_type=refresh_token' 
        + '&refresh_token=' + session.userData.refreshToken
        + '&client_id=' + process.env.MICROSOFT_CLIENT_ID
        + '&client_secret=' + encodeURIComponent(process.env.MICROSOFT_CLIENT_SECRET) 
        + '&resource=' + encodeURIComponent(process.env.MICROSOFT_RESOURCE_GRAPH);
      var opts = {
          url: 'https://login.microsoftonline.com/common/oauth2/token',
          body: data,
          headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }
      };
      require('request').post(opts, function (err, response, body) {
          if (err) {
              return next(err)
          } else {
              var token = JSON.parse(body);
              session.userData.accessTokenGraph = token.access_token;
              session.userData.refreshToken = token.refresh_token;
          }
      })

      session.send("Welcome " + session.userData.userName + "! " + emoji.get('smiley'));
      session.beginDialog('workPrompt');
    } else {
      session.endConversation("Goodbye! " + emoji.get('wave'));
    }
  },
  (session, results) => {
    if (!session.userData.userName) {
      session.endConversation("Goodbye! " + emoji.get('wave') + " You have been logged out.");
    } 
    // else {
    //   session.endConversation("Goodbye!! :wave:");
    // }
  }
]);

bot.dialog('workPrompt', [
    (session) => {
        // prompt for search option
        builder.Prompts.choice(
            session,
            'What would you like to do?',
            [Account.Label, Winwire.Label, Logout.Label],
            {
                maxRetries: 3,
                retryPrompt: 'Not a valid option'
            });
        },
        function (session, result) {
        if (!result.response) {
            // exhausted attemps and no selection, start over
            session.send('Ooops! Too many attemps :( But don\'t worry, I\'m handling that exception and you can try again!');
            return session.endDialog();
        }

        // on error, start over
        session.on('error', function (err) {
            session.send('Failed with message: %s', err.message);
            session.endDialog();
        });

        // continue on proper dialog
        var selection = result.response.entity;
        switch (selection) {
            case Account.Label:
                return session.beginDialog('/account')
            case Winwire.Label:
                return session.beginDialog('/winwire');
            case Logout.Label:
                return session.beginDialog('/logout');
        }
    }
]);

bot.dialog('signinPrompt', [
  (session, args) => {
    if (args && args.invalid) {
      // Re-prompt the user to click the link
      builder.Prompts.text(session, "Please click the signin link.");
    } else {
      if (session.userData.refreshToken) {
        // TODO: Authorization
        //get access token from refresh token
      } else {
        login(session);
      }
    }
  },
  (session, results) => {
    //resuming
    session.userData.loginData = JSON.parse(results.response);
    if (session.userData.loginData && session.userData.loginData.magicCode) {
      session.beginDialog('validateCode');
    } else {
      session.replaceDialog('signinPrompt', { invalid: true });
    }
  },
  (session, results) => {
    if (results.response) {
      //code validated
      session.userData.userName = session.userData.loginData.name;
      session.endDialogWithResult({ response: true });
    } else {
      session.endDialogWithResult({ response: false });
    }
  }
]);

bot.dialog('validateCode', [
  (session) => {
    builder.Prompts.text(session, "Please enter the code you received or type 'quit' to end. ");
  },
  (session, results) => {
    const code = results.response;
    if (code === 'quit') {
      session.endDialogWithResult({ response: false });
    } else {
      if (code === session.userData.loginData.magicCode) {

        var telemetryData = telemetryModule.createTelemetry(session);
        appInsightsClient.trackEvent("userLoggedIn");

        // Authenticated, save
        session.userData.accessToken = session.userData.loginData.accessToken;
        session.userData.refreshToken = session.userData.loginData.refreshToken;

        // getting access token for CRM
        var data = 'grant_type=refresh_token' 
          + '&refresh_token=' + session.userData.refreshToken
          + '&client_id=' + process.env.MICROSOFT_CLIENT_ID
          + '&client_secret=' + encodeURIComponent(process.env.MICROSOFT_CLIENT_SECRET) 
          + '&resource=' + encodeURIComponent(process.env.MICROSOFT_RESOURCE_CRM);
        var opts = {
            url: 'https://login.microsoftonline.com/common/oauth2/token',
            body: data,
            headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }
        };
        require('request').post(opts, function (err, response, body) {
            if (err) {
                return next(err)
            } else {
                var token = JSON.parse(body);
                session.userData.accessTokenCRM = token.access_token;
                //session.userData.refreshToken = token.refresh_token;

                // TODO: Authorize, then save
                session.endDialogWithResult({ response: true });
            }
        })
      } else {
        var telemetryData = telemetryModule.createTelemetry(session);
        appInsightsClient.trackEvent("invalidCode", telemetryData);

        session.send("hmm... Looks like that was an invalid code. Please try again.");
        session.replaceDialog('validateCode');
      }
    }
  }
]);