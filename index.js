'use strict';

const ACKNOWLEDGE_NO = 'yes';
const ACKNOWLEDGE_YES = 'no';

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

      /*
      // Iterates over each entry - there may be multiple if batched
      body.entry.forEach((pageEntry) => {
        // Iterate over each messaging event and handle accordingly
        pageEntry.messaging.forEach((messagingEvent) => {
          console.log({messagingEvent});

          if (messagingEvent.postback) {
            handlePostback(messagingEvent.sender.id, messagingEvent.postback);
          } else if (messagingEvent.message) {
            if (messagingEvent.message.quick_reply){
              handlePostback(messagingEvent.sender.id, messagingEvent.message.quick_reply);
            } else{
              handleMessage(messagingEvent.sender.id, messagingEvent.message);
            }
          } else {
            console.log(
              'Webhook received unknown messagingEvent: ',
              messagingEvent
            );
          }
        });
      });
      */
      body.entry.forEach(function(entry) {

        // Gets the body of the webhook event
        let webhook_event = entry.messaging[0];
        console.log(webhook_event);
      
        // Check if the event is a message or postback and
        // pass the event to the appropriate handler function
        if (webhook_event.message) {
          handleMessage(webhook_event.sender.id, webhook_event.message);        
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
    console.log("Handling normal message event: ")
    
    // Checks if the message contains text
    if (received_message.text) {    
      // Create the payload for a basic text message, which
      // will be added to the body of our request to the Send API
      response = {
        "text": `You sent the message: "${received_message.text}". Now send me an attachment!`
      }
    } else if (received_message.attachments) {
      // Get the URL of the message attachment
      let attachment_url = received_message.attachments[0].payload.url;
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
    } 
    
    // Send the response message
    callSendAPI(sender_psid, response);    
}

function handlePostback(sender_psid, received_postback) {
  console.log("Handling Post back event: ")
  // Get the payload for the postback
  const payload = received_postback.payload

  // Set the response and udpate db based on the postback payload
  switch (payload){
    case ACKNOWLEDGE_YES:
      response = { "text": "Thanks!" }
      break;
    case ACKNOWLEDGE_NO:
      response = { "text": "Try sending another one!" }
      break;
    default:
      console.log('Cannot differentiate payload type.')
  }

  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
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
      "uri": "https://graph.facebook.com/v2.6/me/messages",
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