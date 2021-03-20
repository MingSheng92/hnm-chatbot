'use strict';

const GREETING = 'GREETING';
const ACKNOWLEDGE_NO = 'no';
const ACKNOWLEDGE_YES = 'yes';
const VERSION_DATE = "20210320"
const status_OK = 200

const FACEBOOK_GRAPH_API_BASE_URL = 'https://graph.facebook.com/v2.6/';

// Imports dependencies and set up http server
const
  express = require('express'),
  request = require('request'),
  bodyParser = require('body-parser'),
  app = express().use(bodyParser.json()); // creates express http server

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {  
 
    let body = req.body;
  
    // Checks this is an event from a page subscription
    if (body.object === 'page') {
      if (body.entry && body.entry.length <= 0){
        return;
      }
      
      body.entry.forEach(function(entry) {

        // Gets the body of the webhook event
        let webhook_event = entry.messaging[0];
        //console.log('--------------------------------------------------------------------')
        //console.log(webhook_event);
        //console.log('--------------------------------------------------------------------')

        // Check if the event is a message or postback and
        // pass the event to the appropriate handler function
        if (webhook_event.message) {
          if (webhook_event.message.quick_reply){
            handlePostback(webhook_event.sender.id, webhook_event.message.quick_reply);
          } else{
            handleMessage(webhook_event.sender.id, webhook_event.message);
          } 
        } else if (webhook_event.postback) {
          handlePostback(webhook_event.sender.id, webhook_event.postback);
        }
      });
  
      // Returns a '200 OK' response to all requests
      res.status(200).send('EVENT_RECEIVED');
    } else {
      // Returns a '404 Not Found' if event is not from a page subscription
      res.sendStatus(404);
    }
  
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = process.env.VERIFICATION_STRING
      
    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
      
    // Checks if a token and mode is in the query string of the request
    if (mode && token) {
    
      // Checks the mode and token sent is correct
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        
        // Responds with the challenge token from the request
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      
      } else {
        // Responds with '403 Forbidden' if verify tokens do not match
        res.sendStatus(403);      
      }
    }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;

  // Checks if the message contains text
  if (received_message.text) {    
    // Create the payload for a basic text message, which
    // will be added to the body of our request to the Send API
    response = {
      "text": `You sent the message: "${received_message.text}". Now send me an attachment!`
    }
  } else if (received_message.attachments) {
    // Get the URL of the message attachment
    //let attachment_url = received_message.attachments[0].payload.url;
    console.log(received_message.attachments[0])

    // check which type of attachment did user sent 
    switch (received_message.attachments[0].type){
      case 'location':
        let location = received_message.attachments[0].payload.coordinates
        handleLocationData(sender_psid, location)
        break;      
      default:
        console.log('Attachment type not supported.')
        response = {
          "text": `The following type is not supported now: ${received_message.attachments[0].type}, only accept location data.`
        }
    }

    /*
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "YES",
                "payload": ACKNOWLEDGE_YES,
              },
              {
                "type": "postback",
                "title": "NO",
                "payload": ACKNOWLEDGE_NO,
              }
            ],
          }]
        }
      }
    }
    */
  } 
    
  // Send the response message
  callSendAPI(sender_psid, response);    
}

function handlePostback(sender_psid, received_postback) {
  let response;
  // Get the payload for the postback
  const payload = received_postback.payload

  // Set the response and udpate db based on the postback payload
  switch (payload){
    case GREETING:
      handleGreetingPostback(sender_psid);
      break;      
    case ACKNOWLEDGE_YES:
      console.log("Handling Post back event: Get recommendations")
      hendleSearchPostBack(sender_psid);
      break;
    case ACKNOWLEDGE_NO:
      console.log("Handling Post back event: Try again!")
      break;
    default:
      console.log('Cannot differentiate payload type.')
  }

  // Send the message to acknowledge the postback
  //callSendAPI(sender_psid, response);
}

function handleGreetingPostback(sender_psid){
    request({
      url: `${FACEBOOK_GRAPH_API_BASE_URL}${sender_psid}`,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        fields: "first_name"
      },
      method: "GET"
    }, function(error, response, body) {
      var greeting = "";
      if (error) {
        console.log("Error getting user's name: " +  error);
      } else {
        var bodyObj = JSON.parse(body);
        const name = bodyObj.first_name;
        greeting = "Hi " + name + ", ";
      }
      const message = greeting + "Would you like to know about all the cool restaurants nearby?";
      const greetingPayload = {
        "text": message,
        "quick_replies":[
          {
            "content_type":"text",
            "title":"Yes!",
            "payload": ACKNOWLEDGE_YES,
          },
          {
            "content_type":"text",
            "title":"No, thanks.",
            "payload": ACKNOWLEDGE_NO,
          }
        ]
      };
      callSendAPI(sender_psid, greetingPayload);
    });
}

function hendleSearchPostBack(sender_psid) {
  const askForLocationPayload = {
    "text": "Ok, I have to get to know you a little bit more for this. Where do you live?",
  };
  callSendAPI(sender_psid, askForLocationPayload);
}

function handleLocationData(sender_psid, location) {
  let replyRecommendationPayload;
  const catID = "4d4b7105d754a06374d81259"
  const radius = "500"
  const limit = "5"
  //https://developer.foursquare.com/docs/places-api/getting-started/#create-a-developer-account
  //instead of using google api, we can try to use foursquare's
  console.log("calling foursquare API to get nearest restaurent")
  request({
    "url": `https://api.foursquare.com/v2/venues/search?ll=${location.lat},${location.long}&categoryId=${catID}&radius=${radius}&v=${VERSION_DATE}&limit=${limit}&client_id=${process.env.FS_CLIENT_ID}&client_secret=${process.env.FS_CLIENT_SECRET}`,
    "method": "GET"
  }, (err, res, body)=>{
    //console.log('after calling geocoding api with result:', body);
    if (err) {
      console.error("Unable to retrieve location from Google API:", err);
    } else {
      const bodyObj = JSON.parse(body);
      console.log(bodyObj.meta.code)
      if (bodyObj.meta.code === status_OK){
        replyRecommendationPayload = {
          "attachment":{
             "type":"template",
             "payload":{
               "template_type":"generic",
               "elements":[
                  {
                   "title": bodyObj.response.venues[0].name,
                   "image_url":"https://picsum.photos/200",
                   "subtitle":bodyObj.response.venues[0].location.address,
                   "buttons":[
                     {
                       "type":"web_url",
                       "url":"https://donate.wwf.org.au/campaigns/rhinoappeal/",
                       "title":"Directions"
                     }
                   ]
                 }
               ]
             }
           }
        };
      } else{
        replyRecommendationPayload = {
          "text": 'I am facing some difficulties in getting restaurants data now. Please try again later',
        };
      }
    }
  })

  console.log(replyRecommendationPayload)
  callSendAPI(sender_psid, replyRecommendationPayload);
}

function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": `${FACEBOOK_GRAPH_API_BASE_URL}me/messages`,
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
    } else {
      console.error("Unable to send message:" + err);
    }
  }); 
}