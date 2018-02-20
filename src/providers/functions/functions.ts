import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import * as moment from 'moment';

/*
  Generated class for the FunctionsProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class FunctionsProvider {

  constructor(public http: HttpClient) {
    console.log('Hello FunctionsProvider Provider');
  }

  //Format a raw time to clocktime. Full is true if we want minutes
  formatClockTime(value, full){
    var clockTime;
    var hour = Math.floor(value);
    var minutes = full ? (value - hour) == 0.5 ? ':30' : ':00' : '';
    if(hour < 12)
      clockTime = hour + minutes + ' AM';
    else if(hour < 13 && hour >= 12)
      clockTime = hour + minutes + ' PM';
    else if(hour >= 13 && hour < 24){
      hour = hour - 12;
      clockTime = hour + minutes + ' PM';
    }
    else if(hour >= 24){
      hour = hour - 24;
      clockTime = hour + minutes + ' AM';
    }
    return clockTime;
  }

  //Format a regular time number into our database time format (6-30)
  formatTime(date){
    //Caching values from moment
    var hourNumber = parseInt(moment(date).format('H'));
    var minuteNumber = parseInt(moment(date).format('m'));

    var hour = hourNumber >= 6 ? hourNumber : hourNumber + 24;
    var minute = (minuteNumber / 60);

    return hour + minute;
  }
}
