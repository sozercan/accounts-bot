'use strict';

var builder = require('botbuilder');
var request = require('request');
var platforms = require("./platforms");
var backToMenu = require("./backToMenu");
var emoji = require('node-emoji');

module.exports = {
    Label: 'Winwire information',
    Dialog: [
        function (session, args) {
            builder.Prompts.choice(session, "Would you like to filter by industry area or technology or both?", 'Industry Area|Technology');
        },
        function (session, results, next) {
            switch (results.response.index) {
                case 0:
                    session.send("Got it! Filtering by industry area..." + emoji.get("office"));
                    session.dialogData.filter = 0;
                    break;
                case 1:
                    session.send("Got it! Filtering by technology..." + emoji.get("tv"));
                    session.dialogData.filter = 1;
                    break;
                default:
                    break;
            }
            next();
        },

        function(session) {
            if(session.dialogData.filter == 0){
                builder.Prompts.choice(session, "Which industry area would you like to filter with?", platforms.industry.type);
            } else if (session.dialogData.filter == 1){
                builder.Prompts.choice(session, "Which technology would you like to filter with?", platforms.technology);
            }
        },
        function(session, results, next) {
            var accounts = [];
            var data;

            request({
                url: process.env.GRAPH_SHAREPOINT_URL, 
                headers: {
                    'Authorization': session.userData.accessToken,
                }
            }, function(error, response, body) {
                if(!error) {
                    data = JSON.parse(body);

                     var entity = results.response.entity;
                     
                    //filter results
                    function filterByEntity(el) {
                         if(session.dialogData.filter == 0) {
                             return el.columnSet.Industry === entity;
                         }
                         else if (session.dialogData.filter == 1) {
                             return el.columnSet[entity] === "Y";
                         }
                     }

                    accounts = data.value.filter(filterByEntity);

                    if(accounts.length > 0) {
                        session.send('I found total of %d results:', accounts.length);

                        var message = new builder.Message()
                            .attachmentLayout(builder.AttachmentLayout.carousel)
                            .attachments(accounts.map(cardsAsAttachment));

                        session.send(message);                
                    } else {
                        session.send("No results found with these filters");
                    }

                    session.replaceDialog('/backToMenu', { source: 'winwire' });

                    function cardsAsAttachment(account) {
                        return new builder.HeroCard()
                            .title(account.columnSet.Title)
                            .subtitle(account.columnSet.Solution)
                            .text(account.columnSet.Summary)
                            .images([new builder.CardImage().url("https://logo.clearbit.com/" + account.columnSet.Title.split(' ').join('') + ".com")])
                            .buttons([
                                builder.CardAction.openUrl(session, account.columnSet.Link.Url, 'Learn more')
                            ])
                    }
                }
            });
        }
    ]
};