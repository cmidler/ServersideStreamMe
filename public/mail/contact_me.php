<?php
// Check for empty fields
if(empty($_POST['name'])  		||
   empty($_POST['email']) 		||
   empty($_POST['phone']) 		||
   empty($_POST['message'])	||
   !filter_var($_POST['email'],FILTER_VALIDATE_EMAIL))
   {
   	echo "No arguments Provided!";
   	return false;
   }
	
$name = Trim(stripslashes($_POST['name']));
$email_address = Trim(stripslashes($_POST['email']));
$phone = Trim(stripslashes($_POST['phone']));
$message = Trim(stripslashes($_POST['message']));

$valid=eregi('^([0-9a-z]+[-._+&])*[0-9a-z]+@([-0-9a-z]+[.])+[a-z]{2,6}$',$email_address);
$crack=eregi("(\r|\n)(to:|from:|cc:|bcc:)",$message);
if (!$valid || $crack){
   echo "Invalid email and/or message!";
   return false;
}	
// Create the email and send the message
$to = 'support@whoyuinc.com'; 
$email_address_subject = "Website Contact Form:  $name";
$email_address_body = "We got a new message from our website contact form!\n\n"."Here are the details:\n\nName: $name\n\nEmail: $email_address\n\nPhone: $phone\n\nMessage:\n$message";
$headers = "From: no-reply@parseapps.com\n"; 
$headers .= "Reply-To: $email_address";	
$success = mail($to,$email_address_subject,$email_address_body,$headers);
return $success;			
?>