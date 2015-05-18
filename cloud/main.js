var _ = require('underscore');

//Custom code
Parse.Cloud.afterSave(Parse.User, function(request) {
  //ensure ACL on all new users to protect PII
  var user = request.user;
  
  if (user && !user.existed()) {
    var userACL = new Parse.ACL(user);
    userACL.setPublicReadAccess(true);
    user.setACL(userACL);
    user.save();
  }

});


//custom code for sending a push to the users that have content on a stream
Parse.Cloud.afterSave("StreamShares", function(request){
	Parse.Cloud.useMasterKey();
	var user = request.user;
	//error checking
	if(user == null || user.id == null)
	{
		response.error("-1");
		return;
	}

	//get the streamshare
	var streamShare = request.object;
	//don't push if the stream share existed already
	if(streamShare.existed())
	{
		console.log("Streamshare already exists so no push");
		return;
	}


	//get a stream pointer for the stream shares
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = streamShare.get("stream").id;

	//construct a query to find the users to send a push to
	var query = new Parse.Query("StreamShares");
	query.notEqualTo("user", user);
	query.equalTo("stream", streamPointer);
	query.include("user");
	query.find({
		success: function(streamShares) {
			if(!streamShares || !streamShares.length)
			{
				console.log("No other users have a streamshare");
				return;
			}
			
			//add unique users to array
			var userArray = new Array();
			for(var i =0; i < streamShares.length; i++)
			{
				var j =0;
				var streamUser = streamShares[i].get("user");
				//see if the user is already in the array
				for(; j < userArray.length; j++)
				{
					if(streamUser == userArray[j])
						break;
				}

				//if we reached the end of the array, push the user into the userArray
				if(j == userArray.length)
					userArray.push(streamUser);
			}

			//don't send a push if I don't need to
			if(!userArray.length)
			{
				console.log("Didn't add any users");
				return;
			}

			// Build the actual push notification target query
			/*var pushQuery = new Parse.Query(Parse.Installation);
			pushQuery.containedIn('user', userArray);
			pushQuery.notEqualTo('badge',0);//don't send a push if they haven't opened the old one
			//Send out push
			Parse.Push.send({
				expiration_interval: 1200, //Set 20 minute interval for the user to receive the push
			    where: pushQuery, // Set our Installation query
			    data: {
		    		alert: "New Content On A Stream",
		    		badge: "Increment", //ios only
		    		sound: "cheering.caf",
		    		title: "New Content On A Stream" //android only
		  		}
			}, {
			    success: function() {
			    	console.log("sent push to users on new share");
		      		return;
			    },
			    error: function() {
			    	console.log("error sending push to users on new share");
			     	return;
			    }
		  	});*/


		},
		error: function(err)
		{
			return;
		}
	});


});

//for parse installations before saving
Parse.Cloud.beforeSave("Stream", function(request,response){

	Parse.Cloud.useMasterKey();
	var stream = request.object;
	var expiration = stream.get("endTime");

	//get date of 36 hours in the future
	var thirtySixHours = new Date(new Date().getTime() + 129600000);
	if(thirtySixHours< expiration)
	{
		console.log("expiration is " + expiration + " and thirtySix is " + thirtySixHours);
		response.error("expiration time out of bounds");
	}
	else
		response.success();

});

//for parse installations before saving
Parse.Cloud.beforeSave("UserStreams", function(request,response){
	Parse.Cloud.useMasterKey();
	var userStream = request.object;
	//console.log("new user stream id is " + userStream.id);
	var query = new Parse.Query("UserStreams");
	//get a stream pointer for the stream shares
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = userStream.get("stream").id;
	query.equalTo("stream", streamPointer);
	query.equalTo("user", userStream.get("user"));
	console.log("user for userStream is " + userStream.get("user").id);
	query.find({
		success: function(userStreams)
		{
			if(!userStreams.length)
			{
				response.success();
				return;
			}

			console.log("userstreams[0] id is " + userStreams[0].id);
			console.log("user stream id is " + userStream.id);
			//if different object ids then don't save
			for(var i = 0; i < userStreams.length; i++)
			{
				if(userStreams[i].id != userStream.id)
				{
					console.log("user[0] ", userStreams[0].id);
					response.error("user stream already in database with different id");
					return;
				}
			}

			response.success();

		},
		error: function()
		{
			response.error("Error in installation query");
		}
	});
});

//for parse installations before saving
Parse.Cloud.beforeSave(Parse.Installation, function(request,response){

	//get the submitted user
	var installation = request.object;
	if(installation == null)
	{
		response.error("No installation");
		return;
	}

	//check if the installation is new
	if(installation && !installation.existed())
	{
		console.log("Installation is new " + installation);
		response.success();
	}
	else//it is an update so make sure we set the acl and user
	{
		console.log("Installation is an update");
		//check if it exists in the database or not
		Parse.Cloud.useMasterKey();
		var pushQuery = new Parse.Query(Parse.Installation);
		pushQuery.equalTo("installationId", installation.get("installationId"));
		pushQuery.equalTo("deviceToken", installation.get("deviceToken"));
		pushQuery.find({
			success: function(installationResults)
			{
				//no object to update, return an error, but first create a new installation to save
				if(!installationResults || !installationResults.length || (installationResults[0] != installation))
				{
					//User is allowed to push so create the announcement
				  	var InstallationClass = Parse.Object.extend("_Installation");
					var install = new InstallationClass();

					install.set("installationId",installation.get("installationId"));
					install.set("deviceToken", installation.get("deviceToken"));
					install.set("user", installation.get("user"));
					install.set("appIdentifier", installation.get("appIdentifier"));
					install.set("appName", installation.get("appName"));
					install.set("appVersion", installation.get("appVersion"));
					install.set("badge", installation.get("badge"));
					install.set("channels", installation.get("channels"));
					install.set("deviceType", installation.get("deviceType"));
					install.set("timeZone", installation.get("timeZone"));
					install.set("pushType", installation.get("pushType"));
					install.set("parseVersion", installation.get("parseVersion"));

					var acl = new Parse.ACL();
					acl.setPublicReadAccess(false);
					acl.setPublicWriteAccess(false);
					acl.setWriteAccess(installation.get("user").id, true);
					acl.setReadAccess(installation.get("user").id,true);
					install.setACL(acl);
					install.save(null,
					{
						success:function(installSave) 
						{ 
							console.log("install saved!");
							response.error("Tried to update an installation that doesn't exist");
						},
						error:function(error)
						{
							console.log("error saving install");
							for(var i =0; i < error.length; i++)
								console.log(error[i]);
							response.error("Tried to update an installation that doesn't exist");
						}
					});
				}
				else
				{
					console.log("saving updated installation ")
					response.success();
				}

				return;
			},
			error: function(error)
			{
				console.log("Error in installation query");
				response.error("Error in installation query");
			}

		});
	    
	}

});

//see if we need to delete the share associated with the streamshare
Parse.Cloud.beforeDelete("StreamShares", function(request, response) {
	Parse.Cloud.useMasterKey();
	var streamShare = request.object;
	query = new Parse.Query("StreamShares");
	query.equalTo("share", streamShare.get("share"));
	query.notEqualTo("stream", streamShare.get("stream"));
	query.include("share");
	query.find({
		success: function(streamShares) {
			//means there are other shares so just delete this
			if(streamShares && streamShares.length)
			{
				response.success();
				return;
			}

			//also delete the share
			streamShare.get("share").destroy();
			response.success();
			return;
		},
		error: function(error) {
			response.error("Error " + error.code + " : " + error.message + " when searching for more streamShares.");
		}
	});
});



//helper function to add a new userprivate
Parse.Cloud.define("addUserPrivate", function(request, response){
Parse.Cloud.useMasterKey();

	var user = request.user;
	//error checking
	if(user == null || user.id == null)
	{
		response.error("-1");
		return;
	}

	var query = new Parse.Query("UserPrivate");
	query.equalTo("user",user);
	query.find({
		success: function(userPrivate) {
			if(userPrivate && userPrivate.length)
			{
				response.err("Already exists");
				return;
			}
			var acl = new Parse.ACL();
			acl.setReadAccess(user.id,true);
		    var UserPrivateClass = Parse.Object.extend("UserPrivate");
		    var userPrivate = new UserPrivateClass();
		    userPrivate.set("user", user);
		    userPrivate.set("points", 0);
		    userPrivate.setACL(acl);
		    userPrivate.save();

		    //when we set the user private, automatically set the timer preference
		    user.set("streamTimeHours", 2);
		    user.save();
		    response.success("created");
		},
		error: function(err)
		{
			response.error(err);
		}
	});

    
});

//helper function to update points for creating a stream
Parse.Cloud.define("createStreamUpdatePoints", function(request,response){
	Parse.Cloud.useMasterKey();

	var user = request.user;
	//error checking
	if(user == null || user.id == null)
	{
		response.error("-1");
		return;
	}

	var query = new Parse.Query("UserPrivate");
	query.equalTo("user",user);
	query.first({
		success: function(userPrivate) {
			var points = userPrivate.get("points")+6;
			userPrivate.set("points", points);
			userPrivate.save(null,{
				success:function(saved) { 
					response.success("Saved");
				},
				error:function(error) {
					response.error(error);
				}
			});
		},
		error: function(err){
			response.error(err);
		}
	});
});

//helper function to update points for adding to an existing stream
Parse.Cloud.define("addToStreamUpdatePoints", function(request,response){
	Parse.Cloud.useMasterKey();

	var user = request.user;
	//error checking
	if(user == null || user.id == null)
	{
		response.error("-1");
		return;
	}

	var query = new Parse.Query("UserPrivate");
	query.equalTo("user",user);
	query.first({
		success: function(userPrivate) {
			var points = userPrivate.get("points")+1;
			userPrivate.set("points", points);
			userPrivate.save(null,{
				success:function(saved) { 
					response.success("Saved");
				},
				error:function(error) {
					response.error(error);
				}
			});
		},
		error: function(err){
			response.error(err);
		}
	});
});
//helper function to count the amount of shares for a given stream
Parse.Cloud.define("countSharesForStreams", function(request,response){

	//quick error checking
	Parse.Cloud.useMasterKey();

	if(request == null || request.params == null || 
		request.params.streamId == null)
	{
		response.error("-1");
		return;
	}

	//create the query
	var query = new Parse.Query("StreamShares");
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;			
	query.equalTo("stream",streamPointer);
	query.notEqualTo("isIgnored", true);
	//get the count
	query.count({
		success: function(count) {
			var result = new Array();
			result.push(count);
			var newestTimeQuery = new Parse.Query("StreamShares");
			newestTimeQuery.limit(1);
			newestTimeQuery.descending("createdAt");
			newestTimeQuery.equalTo("stream", streamPointer);
			newestTimeQuery.first({
				success: function(streamShare) {
					result.push(streamShare);
					response.success(result);
				},
				error: function(err) {
            		response.error(err);
        		}
			});
            
        },
        error: function(err) {
            response.error(err);
        }
	});

});

//helper function to count the amount of shares for a given stream
Parse.Cloud.define("countUsersForStreams", function(request,response){

	//quick error checking
	Parse.Cloud.useMasterKey();

	if(request == null || request.params == null || 
		request.params.streamId == null)
	{
		response.error("-1");
		return;
	}

	//create the query
	var query = new Parse.Query("UserStreams");
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;			
	query.equalTo("stream",streamPointer);
	query.notEqualTo("isIgnored", true);
	//get the count
	query.find({
		success: function(count) {
			//need to count based on unique users per unique stream
			var counter = 0;
			var users = new Array();
			for(var i =0; i < count.length; i++)
			{
				var j = 0;
				var u = count[i].get("user").id
				for(; j <users.length; j++)
				{
					if(u == users[j])
						break;
				}
				if(j==users.length)
				{
					users.push(u);
					counter++;
				}
			}
            response.success(counter);
        },
        error: function(err) {
            response.error(err);
        }
	});

});

Parse.Cloud.define("consoleLogFunction", function(request,response){
	var user = request.user;
	console.log("Called console log function with param " + request.params.field);
});



//Helper function to get the streams for a user
Parse.Cloud.define("getStreamsForUser", function(request, response){
	//quick error checking
	Parse.Cloud.useMasterKey();
	var user = request.user;

	if(user == null || user.id == null || request == null || request.params == null || 
		request.params.limit == null)
	{
		response.error("-1");
		return;
	}

	//ok need to query for the streams the user is a part of that are not part of the current streams
	var query = new Parse.Query("UserStreams");
	query.equalTo("user", user);
	query.include("stream");
	query.include("creator");
	query.include("stream_share");
	query.include("share");
	query.limit(request.params.limit);
	query.descending("createdAt");

	Parse.Cloud.run('godMode', { userId: user.id }, {
  		success: function(godMode) {
			//convert the ids to stream objects
			if(request.params.currentStreamsIds && request.params.currentStreamsIds.length)
			{
				var streamObjects = new Array();
				for(var i = 0; i <request.params.currentStreamsIds.length; i++)
				{
					var streamPointer = new Parse.Object("Stream");
					streamPointer.id = request.params.currentStreamsIds[i];
					streamObjects.push(streamPointer);
				}
				query.notContainedIn("stream", streamObjects);
			}

			//find all of the streams the user needs
			query.find({
				success: function(streams) {
					//success but no new streams
					if(!streams || !streams.length)
					{
						response.error("No new streams");
						return;
					}

					var streamList = new Array();
					var destroyList = new Array();
					//get date of 30 minutes ago - 1800000 is 30 minutes ago
					var thirtyMinutesAgo = new Date((new Date().getTime()) - 1800000);
					for(var i = 0; i < streams.length; i++)
					{
						var streamPointer = streams[i].get("stream");
						if(!streamPointer)
							continue;
						console.log("streamPointer is " + streamPointer);
						//make sure the stream ended at most 30 minutes ago
						if(streamPointer.get("endTime") < thirtyMinutesAgo)
							continue;

						//see if a stream is already in the list for this user
						var j =0
						for(; j< streamList.length; j++)
						{
							if(streamPointer.id == streamList[j].stream.id)
								break;
							else
							{
								console.log("streamPointer id is " + streamPointer.id + "and streamlist is " + streamList[j].stream.id);
							}
						}

						//don't get duplicates
						if(j!=streamList.length)
						{
							destroyList.push(streams[i]);
							continue;
						}

						var streamSharePointer = streams[i].get("stream_share");
						var sharePointer = streams[i].get("share");
						var creatorPointer = streams[i].get("creator");
						var dict = {};
		    			dict["stream"] = streamPointer;
		    			dict["stream_share"] = streamSharePointer;
		    			dict["username"] = creatorPointer.get("username");
		    			dict["share"] = sharePointer;
						streamList.push(dict);
					}

					console.log(streamList);
					//remove the duplicates
					if(destroyList.length)
					{
						Parse.Object.destroyAll(destroyList, {
							success:function(deleted)
							{},
							error: function()
							{} 
						});
					}
					response.success(streamList);
					return;

				},
				error: function(error) {
		      		response.error("-2");
		      		return;
		    	}
			});
		},
		error: function(error) {
			response.error("-3");
			return;
		}
	});
});

//help to get shares for a stream
Parse.Cloud.define("getSharesForStream", function(request, response){

	Parse.Cloud.useMasterKey();
	var user = request.user;

	//basic error checking
	if(user == null || user.id == null || request == null || request.params == null || request.params.streamId == null ||
		request.params.lastShareTime == null || request.params.maxShares == null  || request.params.direction == null)
	{
		response.error("-1");
		return;
	}

	//get helper vars
	var maxShares = request.params.maxShares;
	var lastShareTime = request.params.lastShareTime;
	var direction = request.params.direction;

	//create the query
	var query = new Parse.Query("StreamShares");
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;
	query.equalTo("stream", streamPointer);
	query.include("share");
	query.limit(request.params.maxShares);

	var shareTime = request.params.lastShareTime;

	//less than current share
	if(direction == "left")
	{
		query.lessThan("createdAt", shareTime);
		query.descending("createdAt");
	}
	//greater than current share
	else
	{
		query.greaterThan("createdAt", shareTime);
		query.ascending("createdAt");
	}

	//find all of the streams the user needs
	query.find({
		success: function(streamShares) {
			//success 
			response.success(streamShares);
			return;

		},
		error: function(error) {
      		response.error("-2");
      		return;
    	}
	});
});

Parse.Cloud.define("godMode", function(request, response)
{

	var user = new Parse.Object("_User");
	user.id = request.params.userId;

	Parse.Cloud.useMasterKey();
	//create user objects for each userid received
	var userObjects = new Array();

	if(user.id != "LkkQHxxbiG")
	{
		var userPointer = new Parse.Object("_User");
		userPointer.id = "LkkQHxxbiG"; //NickyNick
		userObjects.push(userPointer);
	}
	if(user.id != "vMxgWbiFAq")
	{
		var userPointer = new Parse.Object("_User");
		userPointer.id = "vMxgWbiFAq"; //pittkid32
		userObjects.push(userPointer);
	}
	if(user.id != "mQicCf9VsP")
	{
		var userPointer = new Parse.Object("_User");
		userPointer.id = "mQicCf9VsP"; //Chase
		userObjects.push(userPointer);
	}
	if(user.id != "t6O9gulbTV")
	{
		var userPointer = new Parse.Object("_User");
		userPointer.id = "t6O9gulbTV"; //StreamMe Admin
		userObjects.push(userPointer);
	}


	for(var i =0; i < userObjects.length; i++)
		console.log("users in god mode " + userObjects[i].id)

	var myStreamsQuery = new Parse.Query("UserStreams");
	myStreamsQuery.equalTo("user", user);
	myStreamsQuery.find({
		success:function(myUserStreams)
		{

			var streamObjects = new Array();
			for(var i = 0; i <myUserStreams.length; i++)
			{
				var streamPointer = new Parse.Object("Stream");
				streamPointer.id = myUserStreams[i].get("stream").id;
				streamObjects.push(streamPointer);
			}
			//need to query for new UserStreams based on the users and not a current stream I have
			var query = new Parse.Query("UserStreams");
			if(streamObjects.length)
				query.notContainedIn("stream", streamObjects);
			query.containedIn("creator", userObjects); // the streams for the other users
			query.notEqualTo("user", user);//not my streams
			query.descending("updatedAt");//get the most recently updated one first
			query.include("stream");
			query.include("stream_share");
			query.include("creator");
			query.include("share");
			console.log("before query in god mode");
			//execute the query
			query.find({
				success: function(userStreams) {
					//success but no new streams
					if(!userStreams || !userStreams.length)
					{
						console.log("no user streams on query");
						response.success();
						return;
					}

					console.log("found user streams on query");
					//got some userstreams back.  Let's find the unique ones
					var newUserStreams = new Array();

					//setup the acl
					var acl = new Parse.ACL();
					acl.setPublicReadAccess(false);
					acl.setPublicWriteAccess(false);
					acl.setWriteAccess(user.id, true);
					acl.setReadAccess(user.id,true);

					//return the stream id
					for(var i =0; i<userStreams.length; i++)
					{
						//see if it is already in the streams array
						var exists = 0;
						var stream = userStreams[i].get("stream");
						console.log("Stream id is " + stream.id);
						for(var j = 0; j<newUserStreams.length; j++)
						{
							var existingStream = newUserStreams[j].get("stream").id;
							console.log("existing stream id is " + newUserStreams[j].get("stream").id);
							//found an existing stream
							if(stream.id == existingStream.id)
							{
								exists = 1;
								break;
							}
						}
							
						//doesn't exist so add it
						if(!exists)
						{
							//create a new userstream object
							var UserStreamsClass = Parse.Object.extend("UserStreams");
							var userStream = new UserStreamsClass();
							userStream.set("stream", stream);
							userStream.set("isIgnored",false);
							userStream.set("user",user);
							userStream.set("creator", userStreams[i].get("creator"));
							userStream.set("share", userStreams[i].get("share"));
							userStream.set("stream_share", userStreams[i].get("stream_share"));
							userStream.setACL(acl);
							newUserStreams.push(userStream);
						}
					}


					//now that I found, saveall 
					if(newUserStreams.length)
					{
						console.log("Found new user streams in god mode");
						Parse.Object.saveAll(newUserStreams,{
							success: function() {
								response.success();

							},
							error: function(error) {
								response.success();
			    			}
						});
					}
					else
					{
						console.log("No new user streams in god mode");
						response.success();
					}
				},
				error: function(error) {
					response.success();
		    	}
			});
		},
		error: function(error) {
			response.success();
    	}
	});
	
});

//helper function to send push when new stream
Parse.Cloud.define("sendPushForStream", function(request,response){

	//get the requesting user
	var user = request.user;

	//error checking
	if(user == null || user.id == null || request.params == null || 
		request.params.userIds == null || !request.params.userIds.length || 
		request.params.streamId == null)
	{
		response.error("-1");
		return;
	}

	Parse.Cloud.useMasterKey();

	//make sure the stream exists first
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;

	//stream query
	var query = new Parse.Query("Stream");
	query.equalTo("objectId", request.params.streamId);
	query.find({
		success:function(streams)
		{
			if(!streams || !streams.length)
			{
				response.error("No stream by that Id");
				return;
			}

			//create user objects for each userid received
			var userObjects = new Array();
			for(var i = 0; i < request.params.userIds.length; i++)
			{
				//don't let the user's user id be one of them
				if(user.id == request.params.userIds[i])
					continue;
				var userPointer = new Parse.Object("_User");
				userPointer.id = request.params.userIds[i];
				userObjects.push(userPointer);
			}

			//making sure there is a reason to run the query
			if(!userObjects.length)
			{
				response.success("No users");
				return;
			}

			//make sure we are also only sending to users who don't have the stream
			var userStreamsQuery = new Parse.Query("UserStreams");
			userStreamsQuery.equalTo("stream", streamPointer);
			userStreamsQuery.containedIn("user", userObjects);
			userStreamsQuery.include("user");
			userStreamsQuery.find({

				success: function(userStreams) {
		      		
		      		var userList = new Array();

		      		//loop through the users streams to see if the user has a userstream
		      		for(var j = 0; j < userObjects.length; j++)
		      		{
		      			var tmpUser = userObjects[j];
		      			var i = 0;
		      			//go through the users that have this user stream
				    	for(; i < userStreams.length; i++)
				    	{
				    		var person = userStreams[i].get("user");

				    		//if the query is the user then we need to add the userstream for the user
				    		if(tmpUser.id == person.id)
				    			break;
				    	}

				    	//found match if we looped all the way through userstreams
				    	if(i == userStreams.length)
				    		userList.push(tmpUser);
			    	}

			    	if(userList.length)
			    	{
					  	//Send out push silently to those that have a badge already
					  	// Build the actual push notification target query
						var pushSilentQuery = new Parse.Query(Parse.Installation);
						pushSilentQuery.containedIn("user",userList);
						//Send out push
						Parse.Push.send({
							expiration_interval: 1200, //Set 20 minute interval for the user to receive the push
						    where: pushSilentQuery, // Set our Installation query
						    data: {
					    		data: request.params.streamId,//let the app know there is a new user user stream
					    		"content-available": 1,
					  		}
						}, {
						    success: function() {
						    },
						    error: function() {
						    }
					  	});
					}
				  	response.success();

			  	},
			    error: function() {
			    	response.error("-2");
			     	return;
			    }

			});

		},
		error: function(){
			response.error("-3");
			return;
		}
	});

	

});

//Create a user stream based on a stream Id
Parse.Cloud.define("createNewUserStream", function(request,response){
	
	//get the requesting user
	var user = request.user;

	//error checking
	if(user == null || user.id == null || request.params == null || 
		request.params.streamId == null)
	{
		response.error("-1");
		return;
	}

	Parse.Cloud.useMasterKey();

	//make sure the stream exists first
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;


	//streamshare query
	var query = new Parse.Query("UserStreams");
	query.equalTo("stream", streamPointer);
	query.include("share");
	query.include("creator");
	query.inculde("stream_share");
	query.descending("updatedAt");//get the most recently updated one first
	query.limit(1);
	query.find({
		success:function(userStreams)
		{
			if(!userStreams || !userStreams.length)
			{
				response.error("No stream by that Id");
				return;
			}

			//setup the acl
			var acl = new Parse.ACL();
			acl.setPublicReadAccess(false);
			acl.setPublicWriteAccess(false);
			acl.setWriteAccess(user.id, true);
			acl.setReadAccess(user.id,true);

			//create a new userstream and save it
			var UserStreamsClass = Parse.Object.extend("UserStreams");
			var userStream = new UserStreamsClass();
			userStream.set("stream", streamPointer);
			userStream.set("isIgnored",false);
			userStream.set("user",user);
			userStream.set("creator", userStreams[0].get("creator"));
			userStream.set("share", userStreams[0].get("share"));
			userStream.set("stream_share", userStreams[0].get("stream_share"));
			userStream.setACL(acl);
			userStream.save(null,
			{
				success:function(userStreamSave) 
				{ 
					response.success();
					return;
				},
				error:function(error)
				{
					response.error(error);
					return;
				}
			});

		},
		error: function()
		{
			response.error("-2");
			return;
		}
	});
});


//helper function to get new streams based on the users around you
Parse.Cloud.define("getNewStreamsFromNearbyUsers", function(request,response){

	//get the requesting user
	var user = request.user;

	//error checking
	if(user == null || user.id == null || request.params == null )
	{
		response.error("-1");
		return;
	}

	Parse.Cloud.useMasterKey();
	//create user objects for each userid received
	var userObjects = new Array();
	for(var i = 0; i < request.params.userIds.length; i++)
	{
		//don't let the user's user id be one of them
		if(user.id == request.params.userIds[i])
			continue;
		var userPointer = new Parse.Object("_User");
		userPointer.id = request.params.userIds[i];
		userObjects.push(userPointer);
	}

	var myStreamsQuery = new Parse.Query("UserStreams");
	myStreamsQuery.equalTo("user", user);
	myStreamsQuery.find({
		success:function(myUserStreams)
		{

			var streamObjects = new Array();
			for(var i = 0; i <myUserStreams.length; i++)
			{
				var streamPointer = new Parse.Object("Stream");
				streamPointer.id = myUserStreams[i].get("stream").id;
				streamObjects.push(streamPointer);
			}
			//need to query for new UserStreams based on the users and not a current stream I have
			var query = new Parse.Query("UserStreams");
			if(streamObjects.length)
				query.notContainedIn("stream", streamObjects);
			query.containedIn("user", userObjects); // the streams for the other users
			query.notEqualTo("user", user);//not my streams
			query.descending("updatedAt");//get the most recently updated one first
			query.include("stream");
			query.include("stream_share");
			query.include("creator");
			query.include("share");
			//execute the query
			query.find({
				success: function(userStreams) {
					//success but no new streams
					if(!userStreams || !userStreams.length)
					{
						response.success("No new streams");
						return;
					}
					//got some userstreams back.  Let's find the unique ones
					var newUserStreams = new Array();

					//setup the acl
					var acl = new Parse.ACL();
					acl.setPublicReadAccess(false);
					acl.setPublicWriteAccess(false);
					acl.setWriteAccess(user.id, true);
					acl.setReadAccess(user.id,true);

					//return the stream id
					for(var i =0; i<userStreams.length; i++)
					{
						//see if it is already in the streams array
						var exists = 0;
						var stream = userStreams[i].get("stream");
						console.log("Stream id is " + stream.id);
						for(var j = 0; j<newUserStreams.length; j++)
						{
							var existingStream = newUserStreams[j].get("stream").id;
							console.log("existing stream id is " + newUserStreams[j].get("stream").id);
							//found an existing stream
							if(stream.id == existingStream.id)
							{
								exists = 1;
								break;
							}
						}
							
						//doesn't exist so add it
						if(!exists)
						{
							//create a new userstream object
							var UserStreamsClass = Parse.Object.extend("UserStreams");
							var userStream = new UserStreamsClass();
							userStream.set("stream", stream);
							userStream.set("isIgnored",false);
							userStream.set("user",user);
							userStream.set("creator", userStreams[i].get("creator"));
							userStream.set("share", userStreams[i].get("share"));
							userStream.set("stream_share", userStreams[i].get("stream_share"));
							userStream.setACL(acl);
							newUserStreams.push(userStream);
						}
					}

					//now that I found, saveall 
					Parse.Object.saveAll(newUserStreams,{
						success: function() {


							// Build the actual push notification target query
							var pushQuery = new Parse.Query(Parse.Installation);
							pushQuery.equalTo('user', user);
							pushQuery.equalTo('badge',0);//don't send a push if they haven't opened the old one
							//Send out push
							Parse.Push.send({
								expiration_interval: 1200, //Set 20 minute interval for the user to receive the push
							    where: pushQuery, // Set our Installation query
							    data: {
						    		alert: "New Streams Nearby",
						    		badge: "Increment", //ios only
						    		sound: "cheering.caf",
						    		title: "New Streams" //android only
						  		}
							}, {
							    success: function() {
						      		// Push was successful
						      		response.success("Sent push");
						      		return;
							    },
							    error: function() {
							    	response.error("-2");
							     	return;
							    }
						  	});
						},
						error: function(error) {
							response.error("-3");
		      				return;
		    			}
					});
				},
				error: function(error) {
					response.error("-4");
		      		return;
		    	}
			});
		},
		error: function(error) {
			response.error("-5");
      		return;
    	}
	});

});


//Defining a job for invalidating user streams
Parse.Cloud.job("upkeepUserStreams", function(request, status) {
	// Set up to modify data
	Parse.Cloud.useMasterKey();


	/*var nearbyQuery = new Parse.Query("NearbyUsers");
	nearbyQuery.lessThan("expiration", new Date());
	nearbyQuery.find({
		success: function(nearbyUsers)
		{
			//delete all of the expired user streams
			Parse.Object.destroyAll(nearbyUsers, {
				success:function(deleted)
				{},
				error: function()
				{} 
			});
		},
		error: function()
		{} 

	});*/

	//query valid user streams
	var query = new Parse.Query("UserStreams");
	query.include("stream");
	query.include("stream_share");
	query.find({
		success: function(userStreams)
		{
			var streams = new Array();
			var deleteUserStreams = new Array();
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date().getTime()) - 1800000);
			for(var i =0; i < userStreams.length; i++)
			{
				var streamPointer = userStreams[i].get("stream");
				//make sure the stream ended at most 30 minutes ago
				if(streamPointer.get("endTime") <thirtyMinutesAgo)
				{
					streams.push(streamPointer);
					deleteUserStreams.push(streamPointer);
					deleteUserStreams.push(userStreams[i]);
				}
			}
			
			//check if we have anything in the streams array
			if(!streams.length)
			{
				status.success("Nothing to destory");
				return;
			}

			var streamShareQuery = new Parse.Query("StreamShares");
			streamShareQuery.containedIn("stream",streams);
			streamShareQuery.include("share");
			streamShareQuery.find({

				success: function(expiredStreams)
				{

					var shares = new Array();
					//add all of the stream shares to the delete list
					for(var i = 0; i < expiredStreams.length; i++)
					{
						var share = expiredStreams[i].get("share");
						shares.push(share);
						deleteUserStreams.push(expiredStreams[i]);
					}

					//run destroy query only if need to
					if(deleteUserStreams.length)
					{
						//delete all of the expired user streams
						Parse.Object.destroyAll(deleteUserStreams, {
							success:function(deleted)
							{
								status.success("Destroyed all user streams");
								return;
							},
							error: function()
							{
								status.error("Error deleting");
								return
							} 
						});
					}
					else
					{
						status.success("Nothing to destory");
						return;
					}
				},
				error: function()
				{
					status.error("Error finding expired streams");
					return
				} 
			});
		},
		error: function()
		{
			status.error("Error finding valid userstreams");
			return
		} 
	});
	
	
  
});


