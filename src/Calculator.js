var Ext = window.Ext4 || window.Ext;

var __map = function (mapField, records) {
  var map = {};

  Ext.Array.each(records, function (record) {
    if (record.raw) {
      map[record.raw[mapField]] = record.raw;
    } else {
      map[record[mapField]] = record;
    }
  });

  return map;
};

var __sortByDate = function (dateField, outField, map) {
  var arr = Ext.Object.getValues(map);
  var sorted = [];

  //console.log('__sortByDate:arr', arr);
  arr.sort(function (a, b) {
    var da = Rally.util.DateTime.fromIsoString(a[dateField]);
    var db = Rally.util.DateTime.fromIsoString(b[dateField]);
    return Rally.util.DateTime.getDifference(da, db, 'day');
  });

  Ext.Array.each(arr, function (rec) {
    sorted.push(rec[outField]);
  });

  return sorted;
};

var __sumArray = function (arr, selectorFn) {
  var count = 0;

  Ext.Array.each(arr, function (item) {
    var num = parseInt(selectorFn(item) + '', 10);

    if (!isNaN(num)) {
      count = count + num;
    }
  });

  return count;
};

Ext.define('IterationBreakdownCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',

    _mapReleasesByName: Ext.bind(__map, this, ['Name'], 0),

    _sortReleasesByStartDate: Ext.bind(__sortByDate, this, ['ReleaseStartDate', 'Name'], 0),

    _mapIterationsByName: Ext.bind(__map, this, ['Name'], 0),

    _sortIterationsByStartDate: Ext.bind(__sortByDate, this, ['StartDate', 'Name'], 0),

    _sumArrayByPlanEstimate: Ext.bind(__sumArray, this, [function (item) { return item.PlanEstimate || '0'; }], 1),

    prepareChartData: function (stores) {
      var snapshots = [];

      Ext.Array.each(stores, function (store) {
        store.each(function (record) {
          snapshots.push(record.raw);
        });
      });

      return this.runCalculation(snapshots);
    },

    _bucketArtifactsIntoIterations: function (records) {
      var me = this;
      var rawData = {};

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('iteration') !== -1) {
          return;
        }

        var key = me._getBucketKey(record);
        rawData[key] = me._pushRecord(rawData[key], record);
      });

      return rawData;
    },

    _bucketStoriesIntoReleases: function (records) {
      var bucket = {};
      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase().indexOf('portfolioitem') !== -1) { return; }
        if (record._type.toLowerCase().indexOf('iteration') !== -1) { return; }

        if (!record.Release) { return; }

        bucket[record.Release.Name] = bucket[record.Release.Name] || [];
        bucket[record.Release.Name].push(record);
      });

      return bucket;
    },

    _isIterationInRelease: function (iteration, release) {
      var iStart = Rally.util.DateTime.fromIsoString(iteration.StartDate);
      var rStart = Rally.util.DateTime.fromIsoString(release.ReleaseStartDate);
      var rEnd = Rally.util.DateTime.fromIsoString(release.ReleaseDate);

      return !!((Rally.util.DateTime.getDifference(iStart, rStart, 'day') >= 0) &&
                (Rally.util.DateTime.getDifference(rEnd, iStart, 'day') >= 1));
    },

   _getIterations: function (records) {
      var iterations = [];

      Ext.Array.each(records, function (record) {
        if (record._type.toLowerCase() !== 'iteration') { return; }

        iterations.push(record);
      });

      return iterations;
    },

    _getBucketKey: function (record) {
      console.log('_getBucketKey', record);
      return this._getIterationKey(record.Iteration);
    },

    _getIterationKey: function (iteration) {
      console.log('_getIterationKey', iteration);
      var rawDate = Rally.util.DateTime.fromIsoString(iteration.EndDate);
      var timezone = Rally.util.DateTime.parseTimezoneOffset(iteration.EndDate);
      var localDate = Rally.util.DateTime.add(rawDate, 'minute', timezone * -1);

      //console.log('Date', rawDate, localDate);
      var date = Rally.util.DateTime.formatWithDefault(localDate);
      return iteration.Name + '<br>' + date;
    },

    _sumIterationByField: function (stories, field, values, noValueLabel) {
      var sum = {};
      var pe;
      var v;

      Ext.Array.each(values, function (value) {
        sum[value] = 0;
      });

      Ext.Array.each(stories, function (story) {
        pe = parseInt('' + story.PlanEstimate, 10);
        v = story[field] || noValueLabel;

        if (pe && !isNaN(pe)) {
          sum[v] = sum[v] + story.PlanEstimate;
        }
      });

      return sum;
    },

    _pushRecord: function (arr, itm) {
      if (!Ext.isArray(arr)) {
        return [itm];
      } else {
        return arr.concat([itm]);
      }
    },

    runCalculation: function (records) {
      //console.log('Running Calculations');
      //console.dir(records);

      var me = this;

      me.iterations = me._getIterations(records);

      var iterationMap = me._mapIterationsByName(me.iterations);
      var iterationOrder = me._sortIterationsByStartDate(iterationMap);

      var rawData = me._bucketArtifactsIntoIterations(records);
      var iterationData = {};

      var categories;
      var series = [];

      Ext.Array.each(iterationOrder, function (iteration) {
        var key = me._getIterationKey(iterationMap[iteration]);

        iterationData[key] = me._sumIterationByField(rawData[key], me.field, me.values, me.noValueLabel);
      });

      Ext.Array.each(me.values, function (value) {
        var v = value || me.noValueLabel;
        var data = [];

        Ext.Array.each(iterationOrder, function (iteration) {
          var key = me._getIterationKey(iterationMap[iteration]);

          data.push(iterationData[key][v] || 0);
        });

        var label = Ext.Array.map(v.split('_'), function (word) {
          return Ext.String.capitalize(word.toLowerCase());
        }).join(' ');

        series.push({
          type: 'column',
          name: label,
          data: data
        });
      });

      categories = [];
      Ext.Array.each(iterationOrder, function (iName) {
        categories.push(me._getIterationKey(iterationMap[iName]));
      });

      debugger;

      return {
        categories: categories,
        series: series
      };
    },
});
