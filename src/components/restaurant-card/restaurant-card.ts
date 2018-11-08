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
  @Input() locationText: string;
  @Input() user = {} as any;

  ngOnChanges(changes: {[propKey: string]: SimpleChange}) {
    if(changes.hasOwnProperty('location'))
      this.setDistance();
    if(changes.hasOwnProperty('restaurant') || changes.hasOwnProperty('date') || changes.hasOwnProperty('time')){
      this.processBusinessHours();
      this.processTimeslots();
      this.setSlide();
    }
    if(changes.hasOwnProperty('user'))
      this.checkUser();
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
  countdownIndex = 1; //Index of card we want email capture to appear under
  countdown = {} as any;
  interval: any;
  ratingStars = [] as any;
  timeslotButtons = [] as any;

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

    //Sends the users location to a child component when requested
    events.subscribe('loaded:restaurant', () => {
      if(this.slides)
        this.slides.update(); //Run update function on sliders to stop the stretching issue
      this.processBusinessHours(); //Update business hours to latest when this view is entered
      this.processTimeslots(); //Update timeslots to latest when this view is entered
      this.processRating(); //Update ratings to latest when this view is entered
    });
  }

  ngAfterViewInit(){
    this.checkUser();
  }

  checkUser(){
    if(this.user)
      if(this.user.email){ //Determine if we should show the countdown
        var start = moment(this.user['created_at']),
          end = start.add(3, 'days'),
          isNew = moment().isBefore(end);
        if(isNew && !this.user['earlySupporter'] && !this.user['hours'])
          this.runCountdown(end);
        else
          this.clearCountdown();
      }
  }

  runCountdown(end){
    var self = this;
    this.interval = setInterval(function() {
      var difference = parseInt(end.format('X')) - parseInt(moment().format('X'));

      self.countdown['hours'] = Math.floor(difference / 3600);
      self.countdown['minutes'] = Math.floor(difference % 3600 / 60);
      self.countdown['seconds'] = Math.floor(difference % 60);
      if(self.countdown['seconds'] < 10)
        self.countdown['seconds'] = '0' + self.countdown['seconds'];
      if(self.countdown['minutes'] < 10)
        self.countdown['minutes'] = '0' + self.countdown['minutes'];

      if(difference <= 0) {
        clearInterval(self.interval);
        self.countdown = {};
      }
    }, 1000);
  }

  clearCountdown(){
    clearInterval(this.interval);
    this.countdown = {};
  }

  ngOnInit(){
    //Get business hours
    this.businessHoursData = this.restaurant.businesshours;
    this.processBusinessHours();

    //Get timeslots
    this.timeslotsData = this.restaurant.timeslots;
    this.processTimeslots();

    this.processRating();

    //If there is a featured image
    if(this.restaurant.featuredImage){
      var imageUrl = 'https://eatibl.com/'+'files/'+this.restaurant.featuredImage; //TODO: Change back to this.url
      this.featuredImageUrl = this.sanitizer.bypassSecurityTrustStyle(`url(${imageUrl})`);
    }
  }

  navigateTo(target, timeslotId){
    var current = this;
    setTimeout(function(){
      current.log.sendRestoEvent('Restaurant Card Clicked', 'Restaurant Card', 'User clicked on '+target, current.restaurant._id);
      current.restaurantTapped = true;
      current.timeslotTapped = timeslotId;
      current.navCtrl.push('RestaurantPage', {
        restaurant: JSON.stringify(current.restaurant),
        timeslotsData: JSON.stringify(current.timeslotsData),
        businessHoursData: JSON.stringify(current.businessHoursData),
        timeslotId: timeslotId,
        distance: current.distance,
        date: current.date,
        time: current.time
      }).then(() => {
        current.restaurantTapped = false;
        current.timeslotTapped = '';
      });
    }, 0)
  }

  //Process rating to get rating star layout
  processRating(){
    var rating = this.restaurant.rating.ratingNumber;
    for(var i = 0; i < 5; i++){
      if(rating - 1 >= 0){
        this.ratingStars[i] = 'star';
        rating -= 1;
      } else if(rating >= 0.25) {
        this.ratingStars[i] = 'star-half';
        rating = 0;
      } else if(rating < 0.25)
        this.ratingStars[i] = 'star-outline';
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
        return (timeslot.day == moment(date).format('dddd').toString() && timeslot.time > hour);
      else
        return (timeslot.day == moment(date).format('ddd' +
          'd').toString());
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

    //Build timeslot buttons
    for(var i = 0; i < 3; i++){
      if(this.timeslots[i])
        this.timeslotButtons[i] = this.timeslots[i];
      else
        this.timeslotButtons[i] = '';
    }
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
}
