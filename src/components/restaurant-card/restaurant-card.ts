import { Component, Input, OnInit, OnChanges, SimpleChange, ViewChild, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import {NavController, Slides, Events} from 'ionic-angular';
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import { ApiServiceProvider } from "../../providers/api-service/api-service";
import { Storage } from '@ionic/storage';
import * as _ from 'underscore';
import * as moment from 'moment';
import { FunctionsProvider } from '../../providers/functions/functions';
import { ActivityLoggerProvider } from "../../providers/activity-logger/activity-logger";
import { ENV } from '@app/env';


/**
 * Generated class for the RestaurantComponent component.
 *
 * See https://angular.io/api/core/Component for more info on Angular
 * Components.
 */
@Component({
  selector: 'restaurant-card',
  templateUrl: 'restaurant-card.html'
})
export class RestaurantCardComponent implements OnChanges {
  private isVisible = false;
  private slides: Slides;
  private url: string = ENV.API;

  //Need slides to load before setting this.slides so we can set the current slide based on the active timeslot
  @ViewChild('slides') set content(content: Slides
  ) {
    this.slides = content;
    this.setInitialPosition();
    setTimeout(() => {
      this.isLoaded = true;
      setTimeout(() => {
        this.isVisible = true;
        if(!this.cdRef['destroyed'])
          this.cdRef.detectChanges();
      }, 0);
    }, 0);
  }

  @Input() location = {} as any;
  @Input() restaurant = {} as any;
  @Input() date: string;
  @Input() time: string;
  @Input() cardType: string;
  @Input() index: number;

  ngOnChanges(changes: {[propKey: string]: SimpleChange}) {
    if(changes.hasOwnProperty('location'))
      this.setDistance();
    if(changes.hasOwnProperty('restaurant') || changes.hasOwnProperty('date') || changes.hasOwnProperty('time')){
      this.processBusinessHours();
      this.processTimeslots();
      this.setSlide();
    }
  }

  timeslots: any;
  timeslotsData = {} as any;
  fillerslots = [];
  businessHours = [];
  businessHoursData = {} as any;
  openStatus: string;
  isLoaded: boolean = true;
  isInitial: boolean = true;
  scrollingSlides: any;
  isBeginning: boolean = false;
  isEnd: boolean = false;
  featuredImageUrl: any;
  restaurantTapped = false;
  timeslotTapped = '';
  distance: any;
  emailCaptureIndex = 1; //Index of card we want email capture to appear under
  emailCaptured = false; //Show the success message after email capture
  submitted = false; //To show form errors in email capture form
  haveUser = false; //For displaying email capture form
  emailCapture: FormGroup;

  constructor(
    public navCtrl: NavController,
    private API: ApiServiceProvider,
    private functions: FunctionsProvider,
    private cdRef:ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private formBuilder: FormBuilder,
    private storage: Storage,
    private log: ActivityLoggerProvider,
    public events: Events
  ) {
    //Form controls and validation
    this.emailCapture = this.formBuilder.group({
      email: [
        '', Validators.compose([
          Validators.required,
          Validators.email
        ])
      ]
    });

    //Sends the users location to a child component when requested
    events.subscribe('loaded:restaurant', () => {
      if(this.slides)
        this.slides.update(); //Run update function on sliders to stop the stretching issue
      this.processBusinessHours(); //Update business hours to latest when this view is entered
      this.processTimeslots(); //Update timeslots to latest when this view is entered
    });

    //If email capture elsewhere, don't show email capture card
    events.subscribe('email:captured', () => { //onMap is true if the user is on the map view
      this.haveUser = true;
    });
  }

  ngAfterViewInit(){
    //If we have user on initial load don't show email capture card
    if(this.emailCaptureIndex == this.index) //Only check local store on card that has email capture form
      this.storage.get('eatiblUser').then((val) => {
        if(val)
          this.haveUser = true;
      });
  }

  ngOnInit(){
    //Get business hours
    this.businessHoursData = this.restaurant.businesshours;
    this.processBusinessHours();

    //Get timeslots
    this.timeslotsData = this.restaurant.timeslots;
    this.processTimeslots();

    //If there is a featured image
    if(this.restaurant.featuredImage){
      var imageUrl = this.url+'files/'+this.restaurant.featuredImage;
      this.featuredImageUrl = this.sanitizer.bypassSecurityTrustStyle(`url(${imageUrl})`);
    }
  }

  navigateTo(target, timeslotId){
    if(target != 'top-pick')
      this.log.sendEvent('Restaurant Card Clicked', 'Restaurant Card', 'User clicked on '+target);
    else
      this.log.sendEvent('Top Pick Card Clicked', 'Restaurant Card', 'User clicked on '+target);


    if(this.timeslotsData.length){
      if(timeslotId == '')
        this.restaurantTapped = true;
      else
        this.timeslotTapped = timeslotId;
      this.navCtrl.push('RestaurantPage', {
        restaurant: JSON.stringify(this.restaurant),
        timeslotsData: JSON.stringify(this.timeslotsData),
        businessHoursData: JSON.stringify(this.businessHoursData),
        timeslotId: timeslotId,
        distance: this.distance,
        date: this.date,
        time: this.time
      }).then(() => {
        this.restaurantTapped = false;
        this.timeslotTapped = '';
      });
    }
  }

  //Add open and close hours to businessHours array for ngFor loop in view
  processBusinessHours(){
    for (var i = 0; i < this.businessHoursData.length; i++)
      if(this.businessHoursData[i]['day'] == moment(this.date).format('dddd').toString()){
        this.businessHours = this.businessHoursData[i]['hours'];
      }
    this.checkOpen();
  }

  //To establish open now or closed in view
  checkOpen(){
    //Get current time to compare to open close hours for day
    var time = this.functions.formatTime(this.date);
    var hoursLength = this.businessHours.length;

    if(hoursLength == 0)
      this.openStatus = 'closedToday';

    //Compare current time to open close hours and set to this.open
    if(hoursLength == 2){
      if(this.businessHours[0] == this.businessHours[1])
        this.openStatus = 'closedToday';
      else{
        if(time >= this.businessHours[0] && time < this.businessHours[1]) //During business hours
          this.openStatus = 'open';
        if(time >= this.businessHours[1] ) //After closed
          this.openStatus = 'closed';
        if(time < this.businessHours[0]) //Before open
          this.openStatus = 'willOpen';
      }
    }
    if(hoursLength == 4){
      if((time >= this.businessHours[0] && time < this.businessHours[1]) || (time >= this.businessHours[2] && time < this.businessHours[3])) //During bussines hours
        this.openStatus = 'open';
      if(time >= this.businessHours[3]) //After second closed
        this.openStatus = 'closed';
      if((time <= this.businessHours[2] && time > this.businessHours[1]) || time < this.businessHours[0]) //Before first or second open, but after first closed
        this.openStatus = 'willOpen';
    }
  }

  //Filter timeslots for the currently selected date
  processTimeslots(){
    var hour = (parseInt(moment().format('k')) + (parseInt(moment().format('m')) / 60)); //Current time
    var date = this.date;

    //Filter timeslots by date and time
    this.timeslots = _.filter(this.timeslotsData, function(timeslot){
      if(moment(date).isSame(moment(), 'day'))
        return (timeslot.day == moment(date).format('dddd').toString() && timeslot.time > hour + 0.25); //Add a quarter hour to comparison to prevent bookings within 15 minutes of a booking time
      else
        return (timeslot.day == moment(date).format('dddd').toString());
    });

    //Filter out timeslots that exist outside of business hours
    var current = this; //Cache this for use in filter
    this.timeslots = _.filter(this.timeslots, function(timeslot){
      if(current.businessHours.length == 2){
        return timeslot.time >= current.businessHours[0] && timeslot.time < current.businessHours[1];
      }
      if(current.businessHours.length == 4){
        return (timeslot.time >= current.businessHours[0] && timeslot.time < current.businessHours[1]) || (timeslot.time >= current.businessHours[2] && timeslot.time < current.businessHours[3]);
      }
    });

    this.timeslots = _.sortBy(this.timeslots, 'time');

    //Build filler timeslots
    if(this.timeslots.length < 4 && this.timeslots.length > 0){
      var filler = 4 - this.timeslots.length;
      for(var i = 0; i < filler; i++){
        this.fillerslots.push('filler');
      }
    }
    else
      this.fillerslots = [];

  }

  //When time changes or date changes, set slide to selected time
  setSlide(){
    if(this.slides){
      //time value formatted as 24hr integer
      var time = moment(this.time).get('hour') + (moment(this.time).get('minute') / 60);

      var index = _.findIndex(this.timeslots, function(timeslot){
        return timeslot.time == time;
      });

      //if we can't find that particular timeslot, search for nearby timeslots to shift to
      if(index == -1){
        var timeslotArray = [];
        timeslotArray = _.pluck(this.timeslots, 'time'); //grab all the times
        for (var i = 0; i < timeslotArray.length; i++){
          //find the first timeslot that goes past the selected time
          if (timeslotArray[i] > time && index == -1){
            index = _.findIndex(this.timeslots, function(timeslot){
              return timeslot.time == timeslotArray[i];
            });
          }
        }
      }
      if(index == -1)
        if(this.slides)
          this.slides.slideTo(this.timeslots.length);
      else
        if(this.slides)
          this.slides.slideTo(index - 1)
    }
  }

  //Slide timeslot slider to best deal
  slideTo(timeslotId){
    if(this.slides) {
      //Find index of
      var index = _.findIndex(this.timeslots, function(timeslot){
        return timeslot._id == timeslotId;
      });
      this.slides.slideTo(index - 1)
    }
  }

  nextSlide(){
    this.log.sendEvent('Timeslot: Next Slide', 'Restaurant Card', '');
    if(this.slides)
      if(!this.slides.isEnd())
        this.slides.slideNext();
  }

  prevSlide(){
    this.log.sendEvent('Timeslot: Prev Slide', 'Restaurant Card', '');
    if(this.slides)
      if(!this.slides.isBeginning())
        this.slides.slidePrev();
  }

  //Run and receives response from press-hold directive
  scrollSlides(response, direction){
    if(response == 'press'){
      this.scrollingSlides = setInterval(() => {
        if(direction == 'prev')
          this.prevSlide();
        if(direction == 'next')
          this.nextSlide();
      }, 100)
    }
    if(response == 'pressup'){
      clearInterval(this.scrollingSlides);
    }
  }

  //Det whether the slide is at the end or the beginning on initial load
  setInitialPosition(){
    if(this.slides)
      setTimeout(() => {
        this.isBeginning = this.slides.isBeginning();
        this.isEnd = this.slides.isEnd();
      }, 500);
  }

  //Set whether the slide is at the end or beginning
  slidePosition(){
    if(this.slides){
      this.isBeginning = this.slides.isBeginning();
      this.isEnd = this.slides.isEnd();
    }
  }

  //Determine and set distance in km from restaurant to user location
  setDistance(){
    //Get distance only if coordinates are available
    if(this.location && this.restaurant.latitude && this.restaurant.longitude){
      var distance = this.functions.getDistanceFromLatLonInKm(this.location[0], this.location[1], this.restaurant.latitude, this.restaurant.longitude);
      this.distance = this.functions.roundDistances(distance);
    }
  }

  submitEmail(){
    console.log('submitted')
    this.submitted = true;
    if(this.emailCapture.valid) {
      console.log('valid')
      //Run the check to see if this user has been verified
      this.API.makePost('register/emailOnly', this.emailCapture.value).subscribe(res => {
        if(res['message'] == 'success' || res['message'] == 'existing') {
          this.log.sendEvent('Email Capture: ' +res['message'], 'Intro Slides Modal', JSON.stringify(this.emailCapture.value));
          this.emailCaptured = true;
          var current = this;
          setTimeout(function () {
            current.storage.set('eatiblUser', res['token']);
            current.haveUser = true;
          }, 2000);
        } else {
          this.log.sendEvent('Email Capture: Failed', 'Intro Slides Modal', '');
        }
      });
    }
  }

  clearError(){
    this.submitted = false;
  }
}
