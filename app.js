var express = require("express");
var bodyParser = require('body-parser');
var apiai = require('apiai');
var apiApp = apiai('d77d60abb4b84890aa418baeaa493af3');
var elasticsearch=require('elasticsearch');
const app = express();

const Botly = require("botly");
const botly = new Botly({
    accessToken: "EAAFyxLadCmoBAPAL3DYCi8hLMTyMR4rr05k43vKpUWb1keAG6YPXRN18rnzZC2r9DZBAhov4QyR6TVzfIN1woBDesmZAKJwpQVDbgXfeP6VB4tZCkVfbmTG6Fiwb2cf4jr0r4SfioLkUdCtAsQUZBTpoItO654faKbZClYX6vgkXUZC3PZArmfn9", //page access token provided by facebook 
    verifyToken: "123456", //needed when using express - the verification token you provided when defining the webhook in facebook 
    webHookPath: "/", //defaults to "/", 
    notificationType: Botly.CONST.REGULAR //already the default (optional), 
});

var esClient = new elasticsearch.Client( {
  host: 'elastic:loophole@127.0.0.1:9200',
  log:['error', 'trace','info','warning']
});

esClient.ping({
  // ping usually has a 3000ms timeout
  requestTimeout: Infinity
}, function (error) {
  if (error) {
    console.trace('Elasticsearch cluster is down!');
  } else {
    console.log('Elasticsearch Connected');
  }
});

function searchEs(incId,cb){
		esClient.get({
			index:'sims',
			type:'incidence',
			id:incId
		},function(err,response){
			if(err)
				result="notFound";
			else
				result=response._source;
			cb(result);
		});
}

function filterEs(a,query,cb){
	console.log(a);
	var filter="";
	if(a=="Status")
		filter={"term": {"INCStatus": query}}
	if(a=="Priority")
		filter={"term": {"INCPriority": query}}
	if(a=="Module Name")
		filter={"term": {"INCModuleName": query}}
	if(a=="Updater")
		filter={"term": {"INCUpdBy": query}}
	esClient.search({
		index:'sims',
		type:'incidence',
		body:{  "query": {
                    "bool": {
                        "must": {
                            "match_all": {}
                        },
							filter
                    }
                }
		}
	},function(err,response){
			if(err)
				result="error";
			else {
				console.log(a);
				var hits=[];
				for(var i=0 ; i<response.hits.hits.length ; i++ )
					hits.push(response.hits.hits[i]._id);
				result=hits;
			}
			cb(result);
			}
	);
}

app.get('/',function(req,res){
	filterEs("INCStatus","active",function(result){
		res.send(result);
	});
});

botly.on("message", (senderId, message, data) => {
	console.log(data.text);
	var date = new Date();
    var sessID = date.getMilliseconds();
    var request = apiApp.textRequest(data.text, {
    sessionId:  sessID
	});
	
    request.on('response', function(response) {
			console.log(response);	
		
		var intent=response.result.metadata.intentName;
					console.log(intent);
					switch(intent){
						case "single_incidence":
							var inc=response.result.parameters.incidence;
							var parameter=response.result.parameters.single_parameter;
							var field;
							searchEs(inc,function(result){
								if(result=="notFound") {
										botly.sendText({
												id: senderId,
												text: "Incidence not found"
												});
										}		
									//api.sendMessage("Incidence not found",event.threadID);
								else{
									switch(parameter){
										case "Status":
											field=result.INCStatus;
											break;
										case "Priority":
											field=result.INCPriority;
											break;
										case "Creation Date":
											field=result.INCDateTime;
											break;
										case "Module Name":
											field=result.INCModuleName;
											break;
										case "Creation Date":
											field=result.INCDateTime;
											break;
										case "Details":
											field="Incidence ID : " + inc + "\n" + "Module Name : " + result.INCModuleName + "\n" + "Status : " + result.INCStatus + "\n" + "Priority : " + result.INCPriority + "\n" + "Updated By : " + result.INCUpdBy ;
											break;
										case "Updater":
											field=result.INCUpdBy;
											break;
										case "Screenshot":
											field = {
													body: "Screenshot of incidence " + inc + ": " ,
													attachment: fs.createReadStream(__dirname + result.INCImgPathRef)
											}
											break;
										}


									if(parameter=="Screenshot"||parameter=="Details"){
										botly.sendText({
													id: senderId,
													text: field
													});
									}
										
									//api.sendMessage(field,event.threadID);
									else
									{	var msgout = response.result.fulfillment.speech+" "+ field;
										botly.sendText({
												id: senderId,
												text: msgout
												});
									}
									//	api.sendMessage(response.result.fulfillment.speech +" "+ field, event.threadID);
								}
							});
							break;
						case "multi_incidence":
							var filterTerm=response.result.parameters.filter_term;
							var filterQuery=response.result.parameters.filter_query;
							console.log(response.result.parameters);
							filterEs(filterTerm,filterQuery,function(result){
								console.log(result);
								if(result=="error"){
									botly.sendText({
										id: senderId,
										text: "Please check your question , i couldnt find anything related to that."
										});
								}
									//api.sendMessage("Please check your question , i couldnt find anything related to that.",event.threadID);
								else{
									var msgout = "Found " + result.length + " incidences with " + filterTerm + ": " + filterQuery + ". \n" + "Incidence: " + result;
									botly.sendText({
										id: senderId,
										text: msgout
										});
								}
									//api.sendMessage("Found " + result.length + " incidences with " + filterTerm + ": " + filterQuery + ". \n" + "Incidence: " + result,event.threadID);
							});
							break;
						default:
							botly.sendText({
								id: senderId,
								text: response.result.fulfillment.speech
								});
							//api.sendMessage(response.result.fulfillment.speech,event.threadID);
							break;
		 			}
/*		
		botly.sendText({
			id: senderId,
			text: response.result.fulfillment.speech
			});  */
	});
	
	request.on('error', function(error) {
		console.log(error);
	});
	 
	request.end();
	
});





app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());

app.use("/webhook", botly.router());
app.set('port', (process.env.PORT || 5000))



// Spin up the server
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'));

})