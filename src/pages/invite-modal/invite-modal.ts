import { Component } from '@angular/core';
import {IonicPage, NavController, NavParams, AlertController, ViewController} from 'ionic-angular';
import { Contacts, Contact, ContactField, ContactName } from '@ionic-native/contacts';
import { Validators, FormBuilder, FormGroup } from '@angular/forms';
import { SMS } from '@ionic-native/sms';
import { AndroidPermissions } from '@ionic-native/android-permissions';
import { Storage } from '@ionic/storage';
import * as _ from 'underscore';
import * as decode from 'jwt-decode';
import { FunctionsProvider } from '../../providers/functions/functions';
import { ApiServiceProvider } from "../../providers/api-service/api-service";
import { Device } from '@ionic-native/device';

/**
 * Generated class for the InviteFriendsPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-invite-modal',
  templateUrl: 'invite-modal.html',
})
export class InviteModalPage {

  addContactForm: FormGroup;
  allContacts = {} as any;
  inviteList = [];
  contactIds = [];
  type: any;
  booking: any;
  restaurant: any;
  sendingSMS = false;
  sentSMS = false;
  sendButtonColor = 'secondary';
  user: any;
  dateObject = {} as any;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private contacts: Contacts,
    private androidPermissions: AndroidPermissions,
    private formBuilder: FormBuilder,
    private sms: SMS,
    private alertCtrl: AlertController,
    public viewCtrl: ViewController,
    private storage: Storage,
    private functions: FunctionsProvider,
    private device: Device,
    private API: ApiServiceProvider
  ) {
    //Form controls and validation
    this.addContactForm = this.formBuilder.group({
      name: [
        '', Validators.compose([
          Validators.required,
          Validators.pattern('[a-zA-Z \-]+')
        ])
      ],
      phone: [
        '', Validators.compose([
          Validators.required,
          Validators.pattern('[0-9 ()+-]*')
        ])
      ]
    });

    //Get navparams
    this.type = navParams.get('type');
    this.booking = navParams.get('booking');
    this.restaurant = navParams.get('restaurant');

    if(this.booking){
      this.buildDateObject();
    }
  }

  buildDateObject(){
    var dateOrigin = new Date(this.booking.date);
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
    var day = days[dateOrigin.getDay()];
    var date = dateOrigin.getDate();
    var month = months[dateOrigin.getMonth()];
    this.dateObject.month = month;
    this.dateObject.date = date;
    this.dateObject.day = day;
  }

  //Manually add contacts to the invitee list
  addManually(){
    let alert = this.alertCtrl.create({
      title: 'Add Contact',
      inputs: [
        {
          name: 'name',
          placeholder: 'Name'
        },
        {
          name: 'phone',
          placeholder: 'Phone Number',
          type: 'tel'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Add Contact',
          handler: data => {
            var number = data.phone.replace(/\D/g,''); //Strip all non digits
            number = number.replace(/^1/, ''); //Strip the leading 1
            this.inviteList.push({name: {formatted: data.name}, phoneNumbers: [number]})
          }
        }
      ]
    });
    alert.present();
  }

  //Browse the phone's contacts to add to the invitee list
  browseContacts(){
    var current = this;

    this.androidPermissions.requestPermissions([this.androidPermissions.PERMISSION.READ_CONTACTS, this.androidPermissions.PERMISSION.SEND_SMS]).then(
      result => {
        current.contacts.find(['displayName', 'name', 'phoneNumbers', 'emails'], {filter: "", multiple: true})
          .then(data => {
            //Initialize alert
            let alert = current.alertCtrl.create();
            alert.setTitle('Import Contacts');

            //Sort returned list of contacts by name
            current.allContacts = _.sortBy(data, function(contact){
              return contact.name.formatted;
            });

            //Process each contact to add as a checkbox for import
            for(var i = 0; i < current.allContacts.length; i++){
              (function(contact){
                var phoneNumbers = [];

                //Loop through all the phonenumbers for each contact
                if(contact.phoneNumbers){ //Only loop through phonenumbers if there are any
                  for(var a = 0; a < contact.phoneNumbers.length; a++){
                    var number = contact.phoneNumbers[a].value.replace(/\D/g,''); //Strip all non digits
                    number = number.replace(/^1/, ''); //Strip the leading 1

                    if(number.length == 10) //Only add number if it is the correct length
                      phoneNumbers.push(number);
                  }

                  phoneNumbers = _.uniq(phoneNumbers); //Filter down to only unique numbers
                  contact.phoneNumbers = phoneNumbers;

                  if(phoneNumbers.length) //If there are phone numbers, add the checkbox input to the alert
                    alert.addInput({
                      type: 'checkbox',
                      label: contact.name.formatted,
                      value: contact,
                      checked: current.contactIds.indexOf(contact.rawId) > -1
                    });
                }
              }(current.allContacts[i]));
            }

            alert.addButton('Cancel');
            alert.addButton({
              text: 'Import',
              handler: (data: any) => {
                current.contactIds = []; //Clear contact reference list
                current.inviteList = data;
                for(var i = 0; i < data.length; i++){
                  current.contactIds.push(data[i].rawId); //Push contact ids into contact reference list so we know which ones to check when browse contacts is opened again
                }
              }
            });

            alert.present();
          });
      },
      err => console.log('need permission')
    );
  }

  submitContact(){
    this.inviteList.push({name: this.addContactForm.value.name, phone: this.addContactForm.value.phone})
  }

  removeContact(index, contact){
    this.inviteList.splice(index, 1);
    var contactIdIndex = this.contactIds.indexOf(contact.rawId);
    this.contactIds.splice(contactIdIndex, 1);
  }

  sendInvites(){
    this.sendingSMS = true;
    if(this.inviteList.length > 0){
      for(var i = 0; i < this.inviteList.length; i++){
        var phoneNumber = this.inviteList[i].phoneNumbers[this.inviteList[i].phoneNumbers.length - 1];
        var message;
        if(this.type == 'reminder'){
          message = 'This is a reminder for our booking at '+this.restaurant.name+
              '\n\nDate: '+this.dateObject.day+', '+this.dateObject.month+' '+this.dateObject.date+
              '\nTime: '+this.functions.formatClockTime(this.booking.time, true)+
              '\nDiscount: '+this.booking.discount+'%'+
              '\n\nDownload Eatibl to make your own bookings.'+
              '\nAndroid:' +
              '\nhttp://play.google.com/store/apps/details?id=com.eatibl' +
              '\n\niOS:' +
              '\nappstore.com/eatibl';

        }
        else if(this.type == 'referral'){
          message = 'Check out this great app called Eatibl! You can get up to 50% off when you dine-in at your favourite restaurants.' +
            '\n\nDownload Eatibl for Android:' +
            '\nhttp://play.google.com/store/apps/details?id=com.eatibl' +
            '\n\nDownload Eatibl for iOS:' +
            '\nappstore.com/eatibl';
        }
        var current = this;
        (function(phoneNumber, message){
          current.sms.send(phoneNumber, message, {replaceLineBreaks: true}).then((result) => {
            var postValues = {
              ref_phone: phoneNumber,
              message: message,
              deviceId: current.device.uuid
            };
            //if we have user data, pop it in
            if(current.user._id)
              postValues['user_fid'] = current.user._id;

            if(current.type == 'reminder') //for reminder referrals, track which booking prompted the reminder
              postValues['booking'] = current.booking._id;

            current.API.makePost('referral/save', postValues).subscribe(response => {});
          })
        })(phoneNumber, message);
      }
      var current = this;
      setTimeout(function(){
        current.sendingSMS = false;
        current.sentSMS = true;
        current.sendButtonColor = 'tertiary';
      }, 1000);
      setTimeout(function(){
        current.viewCtrl.dismiss();
      }, 2000)
    }
  }

  dismiss(){
    this.viewCtrl.dismiss();
  }

  //Format phone number to be more readable
  formatPhone(number){
    var s2 = (""+number).replace(/\D/g, '');
    var m = s2.match(/^(\d{3})(\d{3})(\d{4})$/);
    return (!m) ? null : "(" + m[1] + ") " + m[2] + "-" + m[3];
  }

  ionViewDidLoad() {
    console.log('ionViewDidLoad InviteModalPage');
    this.storage.get('eatiblUser').then((val) => {
      if(val){
        this.user = decode(val);
      }
      else
        this.user = {
          email: '',
          name: '',
          phone: '',
          type: ''
        };
    });
  }

}