<?php
 if($_POST['submit'])
 {
 	if(!isset($_POST['name']) ||

 
        !isset($_POST['email']) || ||
 
        !isset($_POST['message'])) {
 
        died('We are sorry, but there appears to be a problem with the form you submitted.');       
 
    }
 
    $name = $_POST['name'];
	$email = $_POST['email'];
	$query = $_POST['message'];
	$email_from = $name.'<'.$email.'>';

 $to="nick@streamme.co";
 $subject="Enquiry!";
 $headers  = 'MIME-Version: 1.0' . "\r\n";
 $headers .= 'Content-type: text/html; charset=iso-8859-1' . "\r\n";
 $headers .= "From: ".$email_from."\r\n";
 $message="	  
 	   
 		 Name:
		 $name 	   
         <br>
 		 Email-Id:
		 $email 	   
         <br>
 		 Message:
		 $query 	   
      
   ";
	if(mail($to,$subject,$message,$headers))
		header("Location:../contact.php?msg=Successful Submission! Thankyou for contacting us.");
	else
		header("Location:../contact.php?msg=Error To send Email! Please email help@StreamMe.co");
		//contact:-your-email@your-domain.com
 }
?>
