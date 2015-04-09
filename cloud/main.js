var _ = require('underscore');
//Custom code for proximity
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
	query.count({
		success: function(count) {
            response.success(count);
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
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date()) - 1800000);
			for(var i = 0; i < streams.length; i++)
			{
				var streamPointer = streams[i].get("stream");
				//make sure the stream ended at most 30 minutes ago
				if(streamPointer.get("endTime") < thirtyMinutesAgo)
					continue;
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
			response.success(streamList);
			return;

		},
		error: function(error) {
      		response.error("-2");
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


//helper function to get new streams based on the users around you
Parse.Cloud.define("getNewStreamsFromNearbyUsers", function(request,response){

	//get the requesting user
	var user = request.user;

	//error checking
	if(user == null || user.id == null || request.params == null || 
		request.params.userIds == null || !request.params.userIds.length)
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

	//making sure there is a reason to run the query
	if(!userObjects.length)
	{
		response.success("No users");
		return;
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
	query.find({
		success: function(userStreams)
		{
			
			var deleteUserStreams = new Array();
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date()) - 1800000);
			for(var i =0; i < userStreams.length; i++)
			{
				var streamPointer = userStreams[i].get("stream");
				//make sure the stream ended at most 30 minutes ago
				if(streamPointer.get("endTime") <thirtyMinutesAgo)
				{
					deleteUserStreams.push(userStreams[i]);
				}
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
			status.error("Error finding valid userstreams");
			return
		} 
	});
	
	
  
});

