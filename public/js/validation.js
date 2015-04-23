
 function validation()
 {
    
	var contactname=document.contactform.name.value;
	var name_exp=/^[A-Za-z\s]+$/;
	if(contactname=='')
	{
		alert("Name Field Should Not Be Empty!");
		document.contactform.name.focus();
		return false;
	}
	else if(!contactname.match(name_exp))
	{
		alert("Invalid Name field!");
		document.contactform.name.focus();
		return false;
	}
	
	var email=document.contactform.email.value;
	//var email_exp=/^[A-Za-z0-9\.-_\$]+@[A-Za-z]+\.[a-z]{2,4}$/;
	var email_exp=/^\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;
	if(email=='')
	{
		alert("Please Enter Email!");
		document.contactform.email.focus();
		return false;
	}
	else if(!email.match(email_exp))
	{
		alert("Invalid Email!");
		document.contactform.email.focus();
		return false;
	}
	
	
	var message=document.contactform.message.value;
	if(message=='')
	{
		alert("Message Field Should Not Be Empty!");
		document.contactform.message.focus();
		return false;
	}
    return true;
 }
