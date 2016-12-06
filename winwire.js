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
            var choices = ['Industry Area', 'Technology'];
            var msg = new builder.Message(session)
                .attachmentLayout(builder.AttachmentLayout.list)
                .attachments([
                    new builder.HeroCard(session)
                        .title("Would you like to filter by industry area or technology?")
                        .buttons([
                            builder.CardAction.imBack(session, choices[0], choices[0]),
                            builder.CardAction.imBack(session, choices[1], choices[1])
                        ]),
            ]);
            builder.Prompts.choice(session, msg, choices);
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
                var a = { actions: [] };
                for (var i = 0; i < platforms.industry.type.length; i++) {
                    var action = platforms.industry.type[i];
                    a.actions.push({ title: action, message: action });
                }

                var msg = new builder.Message()
                    .setText(session, "Which industry area would you like to filter with?")
                    .addAttachment(a);

                builder.Prompts.choice(session, msg, platforms.industry.type);

            } else if (session.dialogData.filter == 1){

                var a = { actions: [] };
                for (var i = 0; i < Object.keys(platforms.technology).length; i++) {
                    var action = Object.keys(platforms.technology)[i];
                    a.actions.push({ title: action, message: action });
                }

                var msg = new builder.Message()
                    .setText(session, "Which technology would you like to filter with?")
                    .addAttachment(a);

                builder.Prompts.choice(session, msg, platforms.technology);
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
                            .images([new builder.CardImage().url("http://image.thum.io/get/http://" + account.columnSet.Title.split(' ').join('') + ".com")])
                            .buttons([
                                builder.CardAction.openUrl(session, account.columnSet.Link.Url, 'Learn more')
                            ])
                    }
                }
            });
        }
    ]
};