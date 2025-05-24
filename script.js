let originalCsvData = null;

document.getElementById('fileInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const csvData = d3.csvParseRows(e.target.result);
      drawTable(csvData);
      drawDiagram(csvData);
      // CSVデータ編集エリアと保存ボタンを表示
      document.getElementById("editCsvButton").style.display = "inline-block";
      document.getElementById("editCsvButton").onclick = function() {
        document.querySelector(".table-container").style.display = "block";
      document.getElementById("editCsvButton").style.display = "none";
      document.getElementById("saveCsv").style.display = "inline-block"; // 保存ボタンを表示
      document.getElementById("reset").style.display = "inline-block"; // 保存ボタンを表示
      originalCsvData = csvData;
      drawTable(csvData);
    };
    };
    reader.readAsText(file);
  }
});

document.getElementById("reset").onclick = function() {
  if (originalCsvData) {
  // ダイヤグラムとテーブルを初期状態に戻す
  drawDiagram(originalCsvData);
  drawTable(originalCsvData);

  // ボタンの表示を元に戻す
  document.getElementById("editCsvButton").style.display = "inline-block";
  document.getElementById("saveCsv").style.display = "none";
  document.getElementById("reset").style.display = "none";  // リセットボタンを非表示に
  }
};

function drawTable(data) {
  const table = document.getElementById("csvTable");
  table.innerHTML = "";
  data.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    row.forEach((cell, colIndex) => {
      const td = document.createElement(rowIndex === 0 ? "th" : "td");
      td.textContent = cell;
      if (rowIndex > 0) td.contentEditable = "true";
      td.addEventListener("input", () => updateDiagram());
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}

function updateDiagram() {
  const table = document.getElementById("csvTable");
  let data = [];
  Array.from(table.rows).forEach(row => {
    let rowData = [];
    Array.from(row.cells).forEach(cell => {
      rowData.push(cell.textContent);
    });
    data.push(rowData);
  });
  drawDiagram(data);
}

function drawDiagram(data) {
  // 既存の図・凡例をクリア
  d3.select("#chart").selectAll("*").remove();
  d3.select(".legend").selectAll("*").remove();

  // CSV の1行目はタイトル、最終行は列車種別情報とする
  const title = data[0][0];
  document.getElementById("title").textContent = title;

  // 駅情報行：タイトル行、列車番号行、列車種別行を除く
  const stationRows = data.slice(2, data.length - 1);

  // ユニークな駅名（先頭出現順）を取得して yScale のドメインに利用
  let uniqueStations = [];
  stationRows.forEach(row => {
    if (!uniqueStations.includes(row[0])) {
      uniqueStations.push(row[0]);
    }
  });

  // 列車番号行（2行目）および列車種別行（最終行）を取得
  const trainNumbers = data[1].slice(1);
  const trainTypes = data[data.length - 1].slice(1);

  // 時刻文字列を分単位に変換する関数
  function parseTime(timeStr) {
    if (!timeStr || timeStr.trim() === "") return null;
    let time = parseInt(timeStr, 10);
    if (isNaN(time)) return null;
    let hours = Math.floor(time / 100);
    let minutes = time % 100;
    return hours * 60 + minutes;
  }

  // 列車情報を、列車種別ごとにグループ化
  let trainMap = {};
  trainNumbers.forEach((num, i) => {
    const type = trainTypes[i];
    if (!trainMap[type]) trainMap[type] = [];
    trainMap[type].push({ number: num, index: i });
  });

  // 内部の描画領域サイズ（内部計算用）
  const width = 800, height = 400;
  const margin = { top: 50, right: 50, bottom: 50, left: 100 };

  // SVG の viewBox と preserveAspectRatio でレスポンシブ化
  const svg = d3.select("#chart")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 各列車の全駅での時刻範囲を取得
  let minTime = 24 * 60, maxTime = 0;
  Object.keys(trainMap).forEach(trainType => {
    trainMap[trainType].forEach(train => {
      // stationRows の順に、各行から該当列の時刻を取得
      stationRows.forEach(row => {
        const timeStr = row[train.index + 1];
        const parsed = parseTime(timeStr);
        if (parsed !== null) {
          minTime = Math.min(minTime, parsed);
          maxTime = Math.max(maxTime, parsed);
        }
      });
    });
  });
  minTime = Math.floor(minTime / 60) * 60;
  maxTime = Math.ceil(maxTime / 60) * 60;

  const xScale = d3.scaleLinear().domain([minTime, maxTime]).range([0, width]);
  const yScale = d3.scalePoint().domain(uniqueStations).range([0, height]);

  // 背景グリッドの描画
  const grid = svg.append("g").attr("class", "grid");
  const ticks = [];
  for (let t = minTime; t <= maxTime; t += 60) {
    ticks.push(t);
  }
  grid.selectAll("line").data(ticks)
    .enter().append("line")
    .attr("x1", d => xScale(d))
    .attr("x2", d => xScale(d))
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", "#eee")
    .attr("stroke-width", 1);

  const axisTicks = [];
  for (let i = minTime / 60; i <= maxTime / 60; i++) {
    axisTicks.push(i * 60);
  }

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickValues(axisTicks)
      .tickFormat(d => `${d/60}:00`))
    .selectAll("text")
    .style("font-size", "12px");

  svg.append("g")
    .call(d3.axisLeft(yScale))
    .selectAll("text")
    .style("font-size", "12px");

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  // 凡例の描画（小さめに表示）
  const legend = d3.select(".legend");
  Object.keys(trainMap).forEach(trainType => {
    const legendItem = legend.append("div")
      .attr("class", "legend-item")
      .html(`<div class="legend-color" style="background-color: ${colorScale(trainType)}"></div><span>${trainType}</span>`);
    legendItem.on("click", function() {
      const isActive = legendItem.classed("active");
      if (!isActive) {
        svg.selectAll(".train-line")
          .transition().duration(300)
          .style("opacity", 0.1);
        svg.selectAll(`.train-line.${trainType}`)
          .transition().duration(300)
          .style("opacity", 1);
      } else {
        svg.selectAll(".train-line")
          .transition().duration(300)
          .style("opacity", 1);
      }
      legendItem.classed("active", !isActive);
    });
  });

  // 各路線の描画（ホバー時にツールチップ表示）
  Object.keys(trainMap).forEach(trainType => {
    const combinedPoints = [];
    trainMap[trainType].forEach(train => {
      // stationRows の順に走査して、該当列の時刻があれば点として追加
      let points = stationRows.map(row => {
        const timeStr = row[train.index + 1];
        if (timeStr && timeStr.trim() !== "") {
          let parsedTime = parseTime(timeStr);
          return parsedTime !== null ? { station: row[0], time: parsedTime, trainNumber: train.number } : null;
        }
        return null;
      }).filter(d => d !== null);
      combinedPoints.push(points);
    });

    // 各列車の線を描画（複数点の場合、到着と発車の両方があれば間を直線で結ぶ）
    combinedPoints.forEach(points => {
      if (points.length > 1) {
        svg.append("path")
          .datum(points)
          .attr("d", d3.line()
            .x(d => xScale(d.time))
            .y(d => yScale(d.station)))
          .attr("stroke", colorScale(trainType))
          .attr("class", `train-line ${trainType}`)
          .attr("fill", "none")
          .attr("stroke-width", 2)
          .on("mouseover", function(event, d) {
            let tooltipText = `列車番号: ${d[0].trainNumber}<br>`;
            d.forEach(point => {
              tooltipText += `${point.station}: ${Math.floor(point.time/60)}:${point.time % 60 < 10 ? '0' : ''}${point.time % 60}<br>`;
            });
            d3.select("#tooltip")
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px")
              .style("display", "block")
              .html(tooltipText);
          })
          .on("mouseout", function() {
            d3.select("#tooltip").style("display", "none");
          });
      }
    });
  });
}

document.getElementById('saveCsv').addEventListener('click', function() {
  const table = document.getElementById("csvTable");
  let csvContent = "";
  Array.from(table.rows).forEach(row => {
    let rowData = [];
    Array.from(row.cells).forEach(cell => {
      rowData.push(cell.textContent);
    });
    csvContent += rowData.join(",") + "\n";
  });
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'edited_data.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
