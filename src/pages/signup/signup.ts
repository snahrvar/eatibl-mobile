import { Component } from '@angular/core';
import { IonicPage, NavController, AlertController } from 'ionic-angular';
import { Validators, FormBuilder, FormGroup } from '@angular/forms';
import { ApiServiceProvider } from "../../providers/api-service/api-service";
import { Storage } from '@ionic/storage';
import * as decode from 'jwt-decode';
import { Device } from '@ionic-native/device';

/**
 * Generated class for the LoginPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-signup',
  templateUrl: 'signup.html',
})
export class SignupPage {

  signupForm: FormGroup;
  response = {} as any;
  submitAttempt = false;
  user: any;
  postObject= {} as any;

  constructor(
    public navCtrl: NavController,
    private API: ApiServiceProvider,
    public alertCtrl: AlertController,
    private formBuilder: FormBuilder,
    private device: Device,
    private storage: Storage
  ) {

    //Form controls and validation
    this.signupForm = this.formBuilder.group({
      name: [
        '', Validators.compose([
          Validators.required,
          Validators.pattern('[a-zA-Z][a-zA-Z ]+')
        ])
      ],
      phone: [
        '', Validators.compose([
          Validators.required,
          Validators.pattern('[0-9 ()+-]*')
        ])
      ],
      email: [
        '', Validators.compose([
          Validators.required,
          Validators.email
        ])
      ],
      password: [
        '', Validators.compose([
          Validators.required,
          Validators.minLength(8)
        ])
      ]
    });
  }

  ionViewDidEnter(){
    this.storage.get('eatiblUser').then((val) => {
      if(val){
        this.user = decode(val);
        this.signupForm.controls['name'].setValue(this.user.name);
        this.signupForm.controls['phone'].setValue(this.user.phone);
        this.signupForm.controls['email'].setValue(this.user.email);
      }
    });
  }

  signup(){
    if(!this.signupForm.valid){
      Object.keys(this.signupForm.controls).forEach(field => { // {1}
        const control = this.signupForm.get(field);            // {2}
        control.markAsTouched({ onlySelf: true });       // {3}
      });
      this.submitAttempt = true;
    }

    //Cache user object and add device id
    this.postObject = this.signupForm.value;
    this.postObject.deviceId = this.device.uuid;

    //Clean up phone number
    this.postObject.phone = this.postObject.phone.replace(/\D/g,''); //Strip all non digits
    this.postObject.phone = this.postObject.phone.replace(/^1/, ''); //Strip the leading 1

    this.API.makePost('user/verify/check', this.signupForm.value).subscribe(response => {
      if(response['err']){ //Twilio says invalid phone number
        let title = 'Invalid Phone Number',
          message = 'The number you have entered is incorrect. Please ensure you have entered an accurate, North American phone number.';
        this.presentAlert(title, message);

      } else { //Phone number is good
        if (response['verify']) //Account needs verification, SMS has been sent
          this.verifyAlert(false);

        else //Account already verified, proceed
          this.submitRegistration();
      }

    });
  }

  //Verification code alert
  verifyAlert(reverify){ //If reverify is true, the user entered a bad code and must reverify
    let title = 'Verify Phone Number',
      message = "We've texted you a verification code. Please enter the code below to complete your registration.";
    if(reverify){
      title = 'Invalid Code';
      message = "The verification code you entered does not match the one sent to you. Please try again.";
    }
    let alert = this.alertCtrl.create({
      title: title,
      message: message,
      inputs: [
        {
          name: 'code',
          placeholder: 'Code',
          type: 'tel'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: data => {
            console.log('Cancel clicked');
          }
        },
        {
          text: 'Submit',
          handler: data => {
            if(data.code){
              const postObj = {
                phone: this.signupForm.value.phone,
                code: data.code
              };
              this.API.makePost('user/verify/confirm', postObj).subscribe(response => {
                if(response['confirmed']) //Code is good :)
                  this.submitRegistration();

                else { //Code is bad :(
                  this.verifyAlert(true);
                }
              });
            }
          }
        }
      ]
    });
    alert.present();
  }

  //Make the api call to submit the registration
  submitRegistration(){

    //make API call to get token if successful, or status 401 if login failed
    this.API.makePost('register', this.postObject).subscribe(response => {
      console.log(response)
      var title;
      var message;
      this.response = response;
      if(this.response.message == 'success'){
        this.storage.set('eatiblUser',this.response.token).then((val) => {
          title = 'Account created';
          message = 'Your account has been created!';
          this.presentSuccessAlert(title, message);
        });
      }
      if(this.response.message == 'email taken'){
        title = 'Email Taken';
        message = 'This email is already associated with an account. Please choose a different email or log in.';
        this.presentAlert(title, message);
      }
      if(this.response.message == 'error'){
        title = 'Error';
        message = 'There was an error creating your account. Please try again.';
        this.presentAlert(title, message);
      }

      //BELOW CODE FOR OUTPUTTING USER INFO

      //this.storage.get('user').then((val) => {
      //  var currentUser = val;
      //  console.log(currentUser);
      //  console.log(decode(currentUser));
      //});
    });
  }

  presentAlert(title, message){
    let alert = this.alertCtrl.create({
      title: title,
      message: message,
      buttons: ['Dismiss']
    });
    alert.present();
  }

  presentSuccessAlert(title, message){
    let alert = this.alertCtrl.create({
      title: title,
      message: message,
      buttons: ['Dismiss']
    });
    alert.present();
    alert.onDidDismiss(() => {
      this.navCtrl.pop();
    });
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad LoginPage');
  }

}
