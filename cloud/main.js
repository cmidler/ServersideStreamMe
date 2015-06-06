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
Parse.Cloud.beforeSave("Share", function(request,response){
	Parse.Cloud.useMasterKey();
	var share = request.object;
	var loc = share.get("location");
	if(!loc)
	{
		//default location
		var point = new Parse.GeoPoint(0, 0);
		share.set("location",point);
	}
	response.success();
});

//for parse installations before saving
Parse.Cloud.beforeSave("Stream", function(request,response){

	Parse.Cloud.useMasterKey();
	var stream = request.object;
	var expiration = stream.get("endTime");

	var loc = stream.get("location");
	if(!loc)
	{
		//default location
		var point = new Parse.GeoPoint(0, 0);
		stream.set("location",point);
	}

	//get date of 36 hours in the future
	var thirtySixHours = new Date(new Date().getTime() + 129600000);
	if(dates.compare(thirtySixHours, expiration)<1)
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

	//if userstream already existed then return success
	if(userStream && userStream.existed())
	{
		response.success();
		return;
	}

	var loc = userStream.get("location");
	if(!loc)
	{
		//default location
		var point = new Parse.GeoPoint(0, 0);
		userStream.set("location",point);
	}

	//console.log("new user stream id is " + userStream.id);
	var query = new Parse.Query("UserStreams");
	//get a stream pointer for the stream shares
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = userStream.get("stream").id;
	query.equalTo("stream", streamPointer);
	query.equalTo("user", userStream.get("user"));
	//console.log("user for userStream is " + userStream.get("user").id);
	query.find({
		success: function(userStreams)
		{
			if(!userStreams.length)
			{
				response.success();
				return;
			}

			//console.log("userstreams[0] id is " + userStreams[0].id);
			//console.log("user stream id is " + userStream.id);
			//if different object ids then don't save
			for(var i = 0; i < userStreams.length; i++)
			{
				if(userStreams[i].id != userStream.id)
				{
					console.log("userstream[i] ", userStreams[i].id);
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


//get an installation
Parse.Cloud.define("getInstallationForIOS", function(request, response){
	Parse.Cloud.useMasterKey();

	var deviceToken = request.params.deviceToken;
	var pushQuery = new Parse.Query(Parse.Installation);
	pushQuery.equalTo("deviceToken", deviceToken);
	pushQuery.include("user");
	pushQuery.find({
		success: function(installationResults)
		{
			//no object to update, return an error, but first create a new installation to save
			if(!installationResults || !installationResults.length)
			{
				response.success();
				return;
			}

			//return the first object found
			response.success(installationResults[0]);

		},
		error: function(error)
		{
			response.error("Error in installation query");
			return;
		}

	});

});

//reset the password for a user
Parse.Cloud.define("resetPassword", function(request, response){
	Parse.Cloud.useMasterKey();

	var userId = request.params.userId;
	var query = new Parse.Query("_User");
	query.equalTo("objectId", userId);
	query.find({
		success: function(users)
		{
			//no object to update, return an error, but first create a new installation to save
			if(!users || !users.length)
			{
				response.success("Register");
				return;
			}

			//reset the user passwords
			for(var i =0; i< users.length; i++)
			{
				users[i].set("password","");
			}

			Parse.Object.saveAll(users,{
				success: function() {
					response.success("Success");
					return;
				},
				error: function(error) {
					response.error("error saving user");
					return;
    			}
			});

		},
		error: function(error)
		{
			response.error("Error in user query");
			return;
		}

	});

});

//for parse installations before saving
/*Parse.Cloud.beforeSave(Parse.Installation, function(request,response){

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
});*/



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
				response.success("Already exists");
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
				if(!u)
					continue;
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


Parse.Cloud.define("countUserStreams", function(request, response)
{
	var user = request.user;
	Parse.Cloud.useMasterKey();
	var query = new Parse.Query("UserStreams");
	query.equalTo("user", user);
	query.equalTo("isIgnored", false);
	query.notEqualTo("isValid", false);
	query.include("stream");
	//find all of the streams the user needs
	query.find({
		success: function(streams) {
			//success but no new streams
			if(!streams || !streams.length)
			{
				response.success(1);
				return;
			}

			var streamList = new Array();
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date().getTime()) - 1800000);
			for(var i = 0; i < streams.length; i++)
			{
				var streamPointer = streams[i].get("stream");
				if(!streamPointer)
					continue;
				//make sure the stream ended at most 30 minutes ago
				if(dates.compare(streamPointer.get("endTime"), thirtyMinutesAgo)<1)
					continue;

				//see if a stream is already in the list for this user
				var j =0
				for(; j< streamList.length; j++)
				{
					if(streamPointer.id == streamList[j].stream.id)
						break;
					else
					{
						//console.log("streamPointer id is " + streamPointer.id + "and streamlist is " + streamList[j].stream.id);
					}
				}

				//don't get duplicates
				if(j!=streamList.length)
				{
					continue;
				}

				var dict = {};
    			dict["stream"] = streamPointer;
				streamList.push(dict);
			}

			response.success(streamList.length);
			return;

		},
		error: function(error) {
      		response.error(-1);
      		return;
    	}
    });

});

//helper function to add user streams based on gps range
Parse.Cloud.define("findStreamsByGPS", function(request, response){
	//quick error checking
	Parse.Cloud.useMasterKey();
	var user = request.user;
	//error checking
	if(user == null || user.id == null || request == null || request.params == null 
		|| request.params.currentLocation == null)
	{
		response.error("-1");
		return;
	}

	var loc = request.params.currentLocation;

	//need to query what userstreams I have
	var query = new Parse.Query("UserStreams");
	query.equalTo("user", user);
	query.notEqualTo("isValid", false);
	query.include("stream");
	query.limit(1000);//try to get as many as I can
	query.descending("createdAt");
	query.find({
		success: function(userStreams) {

			var streamList = new Array();
			for(var i = 0; i < userStreams.length; i++)
			{

				var stream = userStreams[i].get("stream");
				if(!stream)
					continue;

				//make sure there aren't any repeats
				for(var j = 0; j<streamList.length; j++)
				{
					if(stream.id == streamList[j])
						break;
				}

				//add the stream to the list
				if(j == streamList.length)
					streamList.push(stream.id);
			}

			for(var i = 0; i < streamList.length; i++)
				console.log(streamList[i]);

			//do a new query for streams near me
			var streamQuery = new Parse.Query("Stream");
			if(streamList.length)
				streamQuery.notContainedIn("objectId", streamList);
			streamQuery.near("location", loc);
			streamQuery.withinMiles("location", loc, 20000)
			streamQuery.notEqualTo("isValid", false);
			streamQuery.limit(1000);
			streamQuery.include("creator");
			streamQuery.include("firstShare");
			streamQuery.find({
				success: function(streams) {
					if(!streams || !streams.length)
					{
						response.success("No streams");
						return;
					}

					//streams to add.  create new user streams for these objects
					var newUserStreams = new Array();

					//setup the acl
					var acl = new Parse.ACL();
					acl.setPublicReadAccess(false);
					acl.setPublicWriteAccess(false);
					acl.setWriteAccess(user.id, true);
					acl.setReadAccess(user.id,true);

					var streamShareQuery = new Parse.Query("StreamShares");
					streamShareQuery.equalTo("stream", streams[0]);
					streamShareQuery.equalTo("share", streams[0].get("firstShare"));

					for(var i = 1; i < streams.length; i++)
					{
						var share = streams[i].get("firstShare");
						var newQuery = new Parse.Query("StreamShares");
				  		newQuery.equalTo("stream", streams[i]);
						newQuery.equalTo("share", share);
				  		streamShareQuery = Parse.Query.or(streamShareQuery, newQuery);
					}

					//alright lets do a streamshare query
					streamShareQuery.limit(1000);
					streamShareQuery.find({
						success: function(streamShares) {
							if(!streamShares || !streamShares.length)
							{
								response.success("No streamShares");
								return;
							}

							//need to loop over streams and stream shares to construct right userstreams
							for(var i = 0; i < streams.length; i++)
							{
								var stream = streams[i];
								var share = stream.get("firstShare");

								for(var j = 0; j<streamShares.length; j++)
								{
									var streamId = streamShares[j].get("stream").id;
									var shareId = streamShares[j].get("share").id;
									if(stream.id == streamId && shareId == share.id)
									{
										//create a new userstream object
										var UserStreamsClass = Parse.Object.extend("UserStreams");
										var userStream = new UserStreamsClass();
										userStream.set("stream", stream);
										userStream.set("isIgnored",false);
										userStream.set("user",user);
										userStream.set("creator", stream.get("creator"));
										userStream.set("share", share);
										userStream.set("location", stream.get("location"));
										userStream.set("stream_share", streamShares[j]);
										userStream.set("gotByBluetooth", false);
										userStream.set("isValid", true);
										userStream.setACL(acl);
										newUserStreams.push(userStream);
										break;
									}
								}
							}

							//save new user streams
							if(newUserStreams.length)
							{
								Parse.Object.saveAll(newUserStreams,{
									success: function() {
										response.success();
										return;
									},
									error: function(error) {
										response.success();
										return;
					    			}
								});
							}
							else
							{
								response.success("No new user streams");
								return;
							}

						},
						error: function(error) {
					  		response.error("-4");
					  		return;
						}
					});

				},
				error: function(error) {
			  		response.error("-3 " + error);
			  		return;
				}
			});

		},
		error: function(error) {
	  		response.error("-2");
	  		return;
		}
	});


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

	var loc = request.params.currentLocation;
	//ok need to query for the streams the user is a part of that are not part of the current streams
	var query = new Parse.Query("UserStreams");
	query.equalTo("user", user);
	query.notEqualTo("isValid", false);
	
	if(loc)
	{
		query.near("location",loc);
		query.withinMiles("location", loc, 20000)
	}
	query.include("stream");
	query.include("creator");
	query.include("stream_share");
	query.include("share");
	query.limit(request.params.limit);
	query.descending("gotByBluetooth");

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
						//console.log("streamPointer is " + streamPointer);
						//make sure the stream ended at most 30 minutes ago
						if(dates.compare(streamPointer.get("endTime"), thirtyMinutesAgo)<1)
						{

							console.log("Stream is expired: " +streamPointer.id);
							continue;
						}

						console.log("Valid stream is " + streamPointer.id);

						//see if a stream is already in the list for this user
						var j =0
						for(; j< streamList.length; j++)
						{
							if(streamPointer.id == streamList[j].stream.id)
								break;
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
		    			dict["gotByBluetooth"] = streams[i].get("gotByBluetooth");
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
Parse.Cloud.define("getNewestSharesForStream", function(request, response){

	Parse.Cloud.useMasterKey();
	var user = request.user;

	//basic error checking
	if(user == null || user.id == null || request == null || request.params == null 
		|| request.params.streamId == null || request.params.maxShares == null )
	{
		response.error("-1");
		return;
	}

	//get helper vars
	var maxShares = request.params.maxShares;
	var lastShareTime = request.params.lastShareTime;
	var direction = request.params.direction;
	var streamShareIds = request.params.streamShareIds;
	//create the query
	var query = new Parse.Query("StreamShares");
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;
	query.equalTo("stream", streamPointer);
	query.include("share");

	//get the stream shares not to download
	if(streamShareIds)
		query.notContainedIn("objectId",streamShareIds);

	query.limit(request.params.maxShares);
	query.ascending("createdAt");

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
	myStreamsQuery.notEqualTo("isValid", false);
	myStreamsQuery.equalTo("user", user);
	myStreamsQuery.include("stream");
	myStreamsQuery.find({
		success:function(myUserStreams)
		{

			var streamObjects = new Array();
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date().getTime()) - 1800000);
				
			for(var i = 0; i <myUserStreams.length; i++)
			{
				//var streamPointer = new Parse.Object("Stream");
				var streamPointer = myUserStreams[i].get("stream");
				//make sure the stream ended at most 30 minutes ago
				if(dates.compare(streamPointer.get("endTime"), thirtyMinutesAgo)<1)
					continue;
				else
				{
					console.log("end time is " + streamPointer.get("endTime") + " and thirty minute ago is " + thirtyMinutesAgo);
					streamObjects.push(streamPointer);
				}
				
			}
			//need to query for new UserStreams based on the users and not a current stream I have
			var query = new Parse.Query("UserStreams");
			if(streamObjects.length)
				query.notContainedIn("stream", streamObjects);
			query.containedIn("creator", userObjects); // the streams for the other users
			query.notEqualTo("user", user);//not my streams
			query.notEqualTo("isValid", false);
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
							userStream.set("location", stream.get("location"));
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

			    	//for each user add a new userstream
			    	if(userList.length)
			    	{
			    		for(var i = 0; i<userList.length; i++)
			    		{
			    			var newUserId = userList[i].id;
				    		Parse.Cloud.run('createNewUserStream', { newUserId: newUserId, streamId:request.params.streamId  }, {
	  							success: function(createNewUserStream) {},
						  		error: function() {
							    }
				    		});
			    		}
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
						    	response.success("Sent push");
						    },
						    error: function() {
						    	response.error("Couldn't send push");
						    }
					  	});
					}
					else
				  		response.success("No users to send push to");

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

	if(!user)
	{
		user = new Parse.Object("_User");
		user.id = request.params.newUserId;
	} 

	//error checking
	if(user == null || user.id == null || request.params == null || 
		request.params.streamId == null)
	{
		response.error("-1");
		return;
	}

	Parse.Cloud.useMasterKey();

	//make sure the stream exists
	var streamPointer = new Parse.Object("Stream");
	streamPointer.id = request.params.streamId;

	//streamshare query
	var query = new Parse.Query("UserStreams");
	query.equalTo("stream", streamPointer);
	query.notEqualTo("isValid", false);
	query.include("share");
	query.include("creator");
	query.include("stream_share");
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
			userStream.set("stream", userStreams[0].get("stream"));
			userStream.set("isIgnored",false);
			userStream.set("user",user);
			userStream.set("creator", userStreams[0].get("creator"));
			userStream.set("share", userStreams[0].get("share"));
			userStream.set("location", userStreams[0].get("location"));
			userStream.set("stream_share", userStreams[0].get("stream_share"));
			userStream.set("gotByBluetooth", true);
			userStream.set("isValid", true);
			userStream.setACL(acl);
			userStream.save(null,
			{
				success:function(userStreamSave) 
				{ 
					//send a push if we saved a new userstream
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
				    		badge: Increment, //ios only
				    		sound: "cheering.caf",
				    		title: "New Streams Nearby" //android only
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
		if(userPointer)
			userObjects.push(userPointer);
	}

	if(userObjects.length)
	{
		response.error("no user objects");
		return;
	}

	var myStreamsQuery = new Parse.Query("UserStreams");
	myStreamsQuery.equalTo("user", user);
	myStreamsQuery.notEqualTo("isValid", false);
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
			if(userObjects.length)
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

					var nowDate = new Date();
					//return the stream id
					for(var i =0; i<userStreams.length; i++)
					{
						//see if it is already in the streams array
						var exists = 0;
						var stream = userStreams[i].get("stream");
						if(!stream)
							continue;

						//don't get expired streams
						if(dates.compare(stream.get("endTime"), nowDate)<1)
							continue;

						//console.log("Stream id is " + stream.id);
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
							userStream.set("gotByBluetooth", true);
							userStream.setACL(acl);
							newUserStreams.push(userStream);
						}
					}

					if(newUserStreams.length)
					{
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
							    		badge: 1, //ios only
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
					}
					else
					{
						response.success("No new userstreams");	
						return;
					}
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
	/*var query = new Parse.Query("UserStreams");
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
				if(!streamPointer)
					continue;
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
	});*/
	
	var query = new Parse.Query("UserStreams");
	query.include("stream");
	query.include("user");
	query.notEqualTo("isValid", false);
	query.limit(1000);
	//query.include("stream_share");
	query.find({
		success: function(userStreams)
		{
			var streams = new Array();
			var deleteUserStreams = new Array();
			var streamList = new Array();
			var point = new Parse.GeoPoint(0, 0);
			//get date of 30 minutes ago - 1800000 is 30 minutes ago
			var thirtyMinutesAgo = new Date((new Date().getTime()) - 1800000);
			for(var i =0; i < userStreams.length; i++)
			{

				if(!userStreams[i].get("location"))
					userStreams[i].set("location", point);

				var streamPointer = userStreams[i].get("stream");
				var userStreamUser = userStreams[i].get("user");
				if(!streamPointer || !userStreamUser)
				{
					deleteUserStreams.push(userStreams[i]);
					continue;
				}

				if(!streamPointer.get("location"))
				{
					streamPointer.set("location", point);
					streamList.push(streamPointer);
				}

				//make sure the stream ended at most 30 minutes ago
				if(dates.compare(streamPointer.get("endTime"), thirtyMinutesAgo)<1)
				{
					userStreams[i].set("isValid", false);
					streamPointer.set("isValid", false);
					streamList.push(streamPointer);
				}
				else
				{
					userStreams[i].set("isValid", true);
				}

				

				//see if a stream is already in the list for this user
				var j =0
				for(; j< streams.length; j++)
				{
					var streamsUser = streams[j].get("user");
					var streamsId = streams[j].get("stream");
					
					/*if(userStreamUser)
						console.log(streamPointer.id);
					else
						console.log(streamPointer.id + "  " + i);*/

					//if(!userStreamUser.id)
					//	console.log("11112");
					/*if(!streamsId.id)
						console.log("11113");
					if(!streamsUser.id)
						console.log("11114");*/
					//console.log("destroy vars users: " + userStreamUser.id + " " + streamsUser.id + " streams: " + streamPointer.id+ " " + streamsId.id);

					if(streamPointer.id == streamsId.id && userStreamUser.id == streamsUser.id)
						break;
				}

				//don't get duplicates
				if(j==streams.length)
					streams.push(userStreams[i]);
				else
					deleteUserStreams.push(userStreams[i]);
			}

			//console.log("streams length is " + streams.length);
			//console.log("delete length is " + deleteUserStreams.length);
			//console.log("stream length is " + streamList.length);
			if(streamList.length)
			{
				Parse.Object.saveAll(streamList, {
					success:function(updated)
					{
						//status.success("Invalidated all user streams");
						//return;
					},
					error: function(error)
					{
						//status.error("Error invalidating " + error);
						//return
					} 
				});
			}

			//run destroy query only if need to
			if(deleteUserStreams.length)
			{
				console.log("we have users to delete!");
				//delete all of the expired user streams
				Parse.Object.destroyAll(deleteUserStreams, {
					success:function(deleted)
					{
						//status.success("Destroyed all user streams");
						//return;
					},
					error: function()
					{
						//status.error("Error deleting");
						//return
					} 
				});
			}
			
			//check if we have anything in the streams array
			if(!streams.length)
			{
				status.success("Nothing to invalidate");
				return;
			}

			//delete all of the expired user streams
			Parse.Object.saveAll(streams, {
				success:function(updated)
				{
					status.success("Invalidated all user streams");
					return;
				},
				error: function(error)
				{
					status.error("Error invalidating " + error);
					return
				} 
			});
		},
		error: function(error)
		{
			status.error("Error finding valid userstreams");
			return
		} 
	});
  
});

var dates = {
    convert:function(d) {
        // Converts the date in d to a date-object. The input can be:
        //   a date object: returned without modification
        //  an array      : Interpreted as [year,month,day]. NOTE: month is 0-11.
        //   a number     : Interpreted as number of milliseconds
        //                  since 1 Jan 1970 (a timestamp) 
        //   a string     : Any format supported by the javascript engine, like
        //                  "YYYY/MM/DD", "MM/DD/YYYY", "Jan 31 2009" etc.
        //  an object     : Interpreted as an object with year, month and date
        //                  attributes.  **NOTE** month is 0-11.
        return (
            d.constructor === Date ? d :
            d.constructor === Array ? new Date(d[0],d[1],d[2]) :
            d.constructor === Number ? new Date(d) :
            d.constructor === String ? new Date(d) :
            typeof d === "object" ? new Date(d.year,d.month,d.date) :
            NaN
        );
    },
    compare:function(a,b) {
        // Compare two dates (could be of any type supported by the convert
        // function above) and returns:
        //  -1 : if a < b
        //   0 : if a = b
        //   1 : if a > b
        // NaN : if a or b is an illegal date
        // NOTE: The code inside isFinite does an assignment (=).
        return (
            isFinite(a=this.convert(a).valueOf()) &&
            isFinite(b=this.convert(b).valueOf()) ?
            (a>b)-(a<b) :
            NaN
        );
    },
    inRange:function(d,start,end) {
        // Checks if date in d is between dates in start and end.
        // Returns a boolean or NaN:
        //    true  : if d is between start and end (inclusive)
        //    false : if d is before start or after end
        //    NaN   : if one or more of the dates is illegal.
        // NOTE: The code inside isFinite does an assignment (=).
       return (
            isFinite(d=this.convert(d).valueOf()) &&
            isFinite(start=this.convert(start).valueOf()) &&
            isFinite(end=this.convert(end).valueOf()) ?
            start <= d && d <= end :
            NaN
        );
    }
}



