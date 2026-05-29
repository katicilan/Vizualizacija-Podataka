// =======================================================
// KONFIGURACIJA PROSTORA I DIMENZIJA GRAFIKONA
// =======================================================
const margin = {top: 30, right: 30, bottom: 60, left: 60};
const width = 570 - margin.left - margin.right; 
const height = 300 - margin.top - margin.bottom;

// Globalne varijable za spremanje učitanih podataka
let globalCupsData = [];
let globalMatchesData = [];
let globalFifa2022Data = [];
let globalFifa2018Data = [];
let globalAllTimeTeamsData = []; 
let globalWikiStatsData = []; // <--- NOVO: Dodana globalna varijabla za opću statistiku s Wikipedije
let currentSelectedYear = null;

// Godine podržane u navigaciji
let targetYears = [1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];

// Mapiranje specifičnih naziva s karte na nazive u CSV datotekama
const countryNameMap = {
    "United States of America": "United States", 
    "England": "England", 
    "France": "France",
    "Italy": "Italy", 
    "Germany": "Germany", 
    "Brazil": "Brazil",
    "Argentina": "Argentina", 
    "Spain": "Spain", 
    "Uruguay": "Uruguay", 
    "Croatia": "Croatia",
    "Russia": "Russia",
    "Qatar": "Qatar",
    "Republic of Korea": "South Korea"
};

// =======================================================
// 1. ASINKRONO UČITAVANJE SVIH DATOTEKA
// =======================================================
Promise.all([
    d3.csv("data/WorldCups.csv"),
    d3.csv("data/WorldCupMatches.csv"),
    d3.csv("data/Fifa_world_cup_matches.csv"),
    d3.csv("data/world_cup_2018_stats.csv"),
    d3.csv("data/world_cup_all_time_teams.csv"), 
    d3.csv("data/world_cup_wikipedia_stats.csv"),
    d3.json("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
]).then(function([cups, matches, fifa2022, fifa2018, allTimeTeams, wikiStats, worldJson]) {
    
    // Pohrana učitanih podataka
    globalAllTimeTeamsData = allTimeTeams;
    globalWikiStatsData = wikiStats; // <--- NOVO: Spremanje Wikipedija statistike

    // 1.1. Obrada općih podataka o prvenstvima
    globalCupsData = cups.map(d => {
        d.Year = +d.Year;
        d.GoalsScored = +d.GoalsScored;
        d.Attendance = d.Attendance ? +d.Attendance.replace(/\./g, "") : 0;
        return d;
    });

    if (!globalCupsData.some(d => d.Year === 2018)) {
        globalCupsData.push({ Year: 2018, Country: "Russia", Winner: "France", GoalsScored: 169, Attendance: 3031768, MatchesPlayed: 64 });
    }
    if (!globalCupsData.some(d => d.Year === 2022)) {
        globalCupsData.push({ Year: 2022, Country: "Qatar", Winner: "Argentina", GoalsScored: 172, Attendance: 3404252, MatchesPlayed: 64 });
    }

    globalCupsData.sort((a,b) => a.Year - b.Year);

    // 1.2. Obrada povijesnih utakmica (1990 - 2014)
    const seenMatches = new Set();
    globalMatchesData = matches.filter(d => {
        if (!d.MatchID || d.MatchID.trim() === "") return false;
        if (seenMatches.has(d.MatchID)) return false;
        seenMatches.add(d.MatchID);
        d.Year = +d.Year;
        d.Attendance = d.Attendance ? +d.Attendance.replace(/\./g, "") : 0;
        return true;
    });

    globalMatchesData.forEach(m => {
        if(m["Home Team Name"] === "Germany FR" || m["Home Team Name"] === "Germany") m["Home Team Name"] = "Germany";
        if(m["Away Team Name"] === "Germany FR" || m["Away Team Name"] === "Germany") m["Away Team Name"] = "Germany";
    });

    // 1.3. Strukturiranje podataka za 2022.
    globalFifa2022Data = fifa2022.map(d => {
        const formatName = (str) => str ? str.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : "";
        let t1 = formatName(d.team1);
        let t2 = formatName(d.team2);
        return {
            Year: 2022, Team1: t1, Team2: t2,
            Possession1: +d["possession team1"].replace("%",""), Possession2: +d["possession team2"].replace("%",""),
            Goals1: +d["number of goals team1"], Goals2: +d["number of goals team2"],
            Attempts1: +d["total attempts team1"], Attempts2: +d["total attempts team2"],
            OnTarget1: +d["on target attempts team1"], OnTarget2: +d["on target attempts team2"],
            Fouls1: +d["fouls against team1"], Fouls2: +d["fouls against team2"],
            Yellow1: +d["yellow cards team1"], Yellow2: +d["yellow cards team2"],
            Category: d.category, Matchup: `${t1} vs ${t2}`
        };
    });

    // 1.4. Strukturiranje podataka za 2018.
    globalFifa2018Data = fifa2018.map(d => {
        return {
            Year: 2018, Team: d.Team.trim(), Opponent: d.Opponent.trim(), Stage: d.Group,
            GoalsFor: +d["Goals For"], GoalsAgainst: +d["Goals Against"],
            Possession: +d["Ball possession %"], Attempts: +d.Attempts,
            OnTarget: +d["On-Target"], Fouls: +d["Fouls Committed"],
            YellowCards: +d["Yellow cards"], Label: `vs ${d.Opponent.trim()} (${d.Group})`
        };
    });

    d3.select("#team-select").on("change", function() {
        renderUniversalDashboard(this.value, currentSelectedYear);
    });

    const navBar = d3.select("#nav-bar");
    targetYears.forEach(year => {
        navBar.append("button")
            .attr("class", "nav-btn")
            .attr("id", "btn-" + year)
            .text(year + ".")
            .on("click", () => switchScreen(year));
    });

    drawWorldMap(worldJson);
    drawGlobalOverviewCharts();

}).catch(err => console.error("Greška pri učitavanju i obradi podataka:", err));


// =======================================================
// ZASLONI I NAVIGACIJA
// =======================================================
function switchScreen(screenType) {
    d3.selectAll(".nav-btn").classed("active", false);
    
    if (screenType === 'general') {
        d3.select("#btn-general").classed("active", true);
        d3.select("#screen-general").classed("hidden", false);
        d3.select("#screen-yearly").classed("hidden", true);
    } else {
        currentSelectedYear = screenType;
        d3.select("#btn-" + screenType).classed("active", true);
        d3.select("#screen-general").classed("hidden", true);
        d3.select("#screen-yearly").classed("hidden", false);
        
        renderYearlyScreen(screenType);
    }
}

// =======================================================
// 2. KARTA SVIJETA (SA SVI-TIME I WIKI PODACIMA)
// =======================================================
function drawWorldMap(geoData) {
    const mapWidth = 730, mapHeight = 400;
    const svg = d3.select("#world-map").append("svg").attr("width", mapWidth).attr("height", mapHeight);
    const g = svg.append("g");
    const projection = d3.geoMercator().scale(110).translate([mapWidth / 2, mapHeight / 1.4]);
    const pathGenerator = d3.geoPath().projection(projection);

    const zoomBehavior = d3.zoom().scaleExtent([1, 8]).on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoomBehavior);

    svg.on("click", function(event) { 
        if (event.target.tagName === "svg") {
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
        } 
    });

    let winnersCount = {};
    globalCupsData.forEach(d => { 
        if(d.Winner) {
            let nameNorm = d.Winner === "Germany FR" ? "Germany" : d.Winner;
            winnersCount[nameNorm] = (winnersCount[nameNorm] || 0) + 1; 
        }
    });

    g.selectAll(".country").data(geoData.features).enter().append("path").attr("class", "country")
        .attr("d", pathGenerator)
        .attr("fill", d => {
            let csvName = countryNameMap[d.properties.NAME] || d.properties.NAME;
            if (winnersCount[csvName]) {
                return winnersCount[csvName] >= 5 ? "#d69e2e" : (winnersCount[csvName] >= 3 ? "#2f855a" : "#48bb78");
            }
            return "#cbd5e0";
        })
        .on("mouseover", function(event, d) {
            let csvName = countryNameMap[d.properties.NAME] || d.properties.NAME;
            let displayWinnerName = csvName === "Germany" ? "Njemačka" : d.properties.NAME;
            d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px")
                .select("#tooltip-value").html(`<b>${displayWinnerName}</b><br>Naslova svjetskih prvaka: ${winnersCount[csvName] || 0}`);
            d3.select("#tooltip").classed("hidden", false);
        })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true))
        .on("click", function(event, d) {
            event.stopPropagation();
            
            const bounds = pathGenerator.bounds(d);
            const dx = bounds[1][0] - bounds[0][0], dy = bounds[1][1] - bounds[0][1];
            const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / mapWidth, dy / mapHeight)));
            svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity.translate(mapWidth / 2 - scale * ((bounds[0][0] + bounds[1][0]) / 2), mapHeight / 2 - scale * ((bounds[0][1] + bounds[1][1]) / 2)).scale(scale));

            let geoName = d.properties.NAME;
            let csvName = countryNameMap[geoName] || geoName;
            let searchNameUpper = csvName.toUpperCase();

            let odigranoUtakmica = 0;
            let zabijenoGolova = 0;

            globalMatchesData.forEach(m => {
                let homeUpper = m["Home Team Name"] ? m["Home Team Name"].toUpperCase() : "";
                let awayUpper = m["Away Team Name"] ? m["Away Team Name"].toUpperCase() : "";
                if (homeUpper === searchNameUpper) { odigranoUtakmica++; zabijenoGolova += (+m["Home Team Goals"] || 0); }
                else if (awayUpper === searchNameUpper) { odigranoUtakmica++; zabijenoGolova += (+m["Away Team Goals"] || 0); }
            });

            globalFifa2018Data.forEach(m => {
                if ((m.Team ? m.Team.toUpperCase() : "") === searchNameUpper) { odigranoUtakmica++; zabijenoGolova += (m.GoalsFor || 0); }
            });

            globalFifa2022Data.forEach(m => {
                let t1Upper = m.Team1 ? m.Team1.toUpperCase() : "";
                let t2Upper = m.Team2 ? m.Team2.toUpperCase() : "";
                if (t1Upper === searchNameUpper) { odigranoUtakmica++; zabijenoGolova += (m.Goals1 || 0); }
                else if (t2Upper === searchNameUpper) { odigranoUtakmica++; zabijenoGolova += (m.Goals2 || 0); }
            });

            let allTimeStats = globalAllTimeTeamsData.find(t => t.Team.toLowerCase() === csvName.toLowerCase());
            let displaySidebarName = geoName === "Germany" ? "Njemačka" : geoName;
            let sidebarContent = d3.select("#sidebar-content");

            if (allTimeStats || odigranoUtakmica > 0) {
                sidebarContent.html(`
                    <div class="stats-card">
                        <h3 style="margin: 0 0 5px 0; text-align:center;">${displaySidebarName}</h3>
                        <p class="stats-subtitle" style="font-size:11px; text-align:center; color:#777; text-transform:uppercase;">Statistički profil reprezentacije</p>
                        <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                        <p style="margin: 4px 0;">🏆 <b>Naslova prvaka:</b> <span style="float:right; font-weight:bold; color:#b7791f;">${winnersCount[csvName] || 0}</span></p>
                        
                        <h4 style="margin:12px 0 6px 0; color:#2b6cb0; border-bottom:1px dashed #e2e8f0; padding-bottom:2px;">Vječna ljestvica (1930 - 2022)</h4>
                        <p style="margin: 4px 0;">🏟️ Ukupno utakmica: <span style="float:right; font-weight:bold;">${allTimeStats ? allTimeStats.Matches : 'Nema pod.'}</span></p>
                        <p style="margin: 4px 0;">✅ Pobijede (W): <span style="float:right; font-weight:bold; color:#2e7d32;">${allTimeStats ? allTimeStats.Wins : 'Nema pod.'}</span></p>
                        <p style="margin: 4px 0;">🤝 Neriješeno (D): <span style="float:right; font-weight:bold; color:#f57c00;">${allTimeStats ? allTimeStats.Draws : 'Nema pod.'}</span></p>
                        <p style="margin: 4px 0;">❌ Porazi (L): <span style="float:right; font-weight:bold; color:#c62828;">${allTimeStats ? allTimeStats.Losses : 'Nema pod.'}</span></p>
                        <p style="margin: 4px 0;">⭐ Ukupno bodova: <span style="float:right; font-weight:bold; color:#2196f3;">${allTimeStats ? allTimeStats.Points : 'Nema pod.'}</span></p>
                        ${allTimeStats ? `
                            <div style="margin-top:12px;">
                                <p style="margin:2px 0; font-size:12px;">Postotak pobjeda: <strong>${allTimeStats.WinRate_Percent}%</strong></p>
                                <div style="background-color:#e0e0e0; border-radius:10px; height:8px; width:100%; overflow:hidden;">
                                    <div style="background-color:#2196f3; height:100%; width: ${allTimeStats.WinRate_Percent}%; transition: width 0.5s;"></div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `);
            } else {
                sidebarContent.html(`
                    <div class="stats-card" style="padding:15px; background:#fafafa; border-left:4px solid #cbd5e0;">
                        <h3>${displaySidebarName}</h3>
                        <p style="color:#777; font-style:italic; margin-top:8px; font-size:13px;">Ova država se još nije kvalificirala na završnice prvenstava.</p>
                    </div>
                `);
            }
        });
}

// =======================================================
// 3. ZBIRNI GRAFIKONI SVIH PRVENSTAVA NA POČETNOM ZASLONU
// =======================================================
function drawGlobalOverviewCharts() {
    const filteredCups = globalCupsData.filter(d => d.Year >= 1990);
    const gMargin = {top: 20, right: 30, bottom: 40, left: 65};
    const gWidth = 540 - gMargin.left - gMargin.right;
    const gHeight = 240 - gMargin.top - gMargin.bottom;

    const svgGoals = d3.select("#global-goals-chart").append("svg").attr("width", gWidth + gMargin.left + gMargin.right).attr("height", gHeight + gMargin.top + gMargin.bottom).append("g").attr("transform", `translate(${gMargin.left},${gMargin.top})`);
    const x = d3.scalePoint().domain(filteredCups.map(d => d.Year)).range([0, gWidth]);
    const yGoals = d3.scaleLinear().domain([d3.min(filteredCups, d => d.GoalsScored) - 15, d3.max(filteredCups, d => d.GoalsScored) + 10]).range([gHeight, 0]);

    svgGoals.append("g").attr("transform", `translate(0,${gHeight})`).call(d3.axisBottom(x));
    svgGoals.append("g").call(d3.axisLeft(yGoals).ticks(6));
    const lineGoals = d3.line().x(d => x(d.Year)).y(d => yGoals(d.GoalsScored)).curve(d3.curveMonotoneX);
    svgGoals.append("path").datum(filteredCups).attr("class", "line-global-goals").attr("d", lineGoals);

    svgGoals.selectAll(".dot-goals").data(filteredCups).enter().append("circle").attr("class", "dot-global").attr("stroke", "#3182ce").attr("cx", d => x(d.Year)).attr("cy", d => yGoals(d.GoalsScored)).attr("r", 5)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(`<b>Prvenstvo ${d.Year}.</b><br>Domaćin: ${d.Country}<br>Ukupno golova: <b>${d.GoalsScored}</b>`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));

    const svgAttendance = d3.select("#global-attendance-chart").append("svg").attr("width", gWidth + gMargin.left + gMargin.right).attr("height", gHeight + gMargin.top + gMargin.bottom).append("g").attr("transform", `translate(${gMargin.left},${gMargin.top})`);
    const yAttendance = d3.scaleLinear().domain([1500000, d3.max(filteredCups, d => d.Attendance) * 1.05]).range([gHeight, 0]);

    svgAttendance.append("g").attr("transform", `translate(0,${gHeight})`).call(d3.axisBottom(x));
    svgAttendance.append("g").call(d3.axisLeft(yAttendance).ticks(5).tickFormat(d => (d / 1000000).toFixed(1) + "M"));
    const lineAttendance = d3.line().x(d => x(d.Year)).y(d => yAttendance(d.Attendance)).curve(d3.curveMonotoneX);
    svgAttendance.append("path").datum(filteredCups).attr("class", "line-global-attendance").attr("d", lineAttendance);

    svgAttendance.selectAll(".dot-attendance").data(filteredCups).enter().append("circle").attr("class", "dot-global").attr("stroke", "#319795").attr("cx", d => x(d.Year)).attr("cy", d => yAttendance(d.Attendance)).attr("r", 5)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(`<b>Prvenstvo ${d.Year}.</b><br>Ukupna gledanost:<br><b>${d.Attendance.toLocaleString()}</b> gledatelja`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));
}

// =======================================================
// 4. UPRAVLJANJE FILTER DROPDOWN POPISOM ZA REPREZENTACIJE
// =======================================================
function updateTeamDropdownUniversal(year) {
    const select = d3.select("#team-select");
    select.html(""); 
    let teamsSet = new Set();

    if (year === 2022) { globalFifa2022Data.forEach(m => { teamsSet.add(m.Team1); teamsSet.add(m.Team2); }); } 
    else if (year === 2018) { globalFifa2018Data.forEach(m => { teamsSet.add(m.Team); }); } 
    else {
        globalMatchesData.filter(m => m.Year === year).forEach(m => {
            if(m["Home Team Name"]) teamsSet.add(m["Home Team Name"]);
            if(m["Away Team Name"]) teamsSet.add(m["Away Team Name"]);
        });
    }

    let sortedTeams = Array.from(teamsSet).sort();
    sortedTeams.forEach(team => { select.append("option").attr("value", team).text(team); });

    if (year === 2022) select.property("value", "Argentina");
    else if (year === 2018) select.property("value", "Croatia");
    else if (year === 2014) select.property("value", "Germany");
    else if (year === 2010) select.property("value", "Spain");
    else if (year === 2006) select.property("value", "Italy");
    else if (year === 2002) select.property("value", "Brazil");
    else if (year === 1998) select.property("value", "France");
    else if (year === 1994) select.property("value", "Brazil");
    else if (year === 1990) select.property("value", "Germany");
}

// =======================================================
// NOVO / OSVJEŽENO: DINAMIČKO POVLAČENJE PODATAKA IZ CSV-A
// =======================================================
function renderYearlyScreen(year) {
    const cup = globalCupsData.find(d => d.Year === year);
    let displayHost = cup ? (cup.Country === "Germany" ? "Njemačka" : cup.Country) : "";
    let displayWinner = cup ? (cup.Winner === "Germany FR" ? "Njemačka" : cup.Winner) : "";

    // Dinamičko traženje zapisa u datoteci world_cup_wikipedia_stats.csv
    const wikiRow = globalWikiStatsData.find(d => +d.Year === year);
    let topScorer = "Nema podataka";
    let bestPlayer = "Nema podataka";

    if (wikiRow) {
        topScorer = wikiRow["Top scorer(s)"] || "Nema podataka";
        bestPlayer = wikiRow["Best player award"] || "Nema podataka";
        
        // Čišćenje uglatih zagrada s Wikipedijinim referencama
        topScorer = topScorer.replace(/\[\d+\]/g, "");
        bestPlayer = bestPlayer.replace(/\[\d+\]/g, "");
    }

    d3.select("#yearly-title").text(`Službeni podaci za Svjetsko Prvenstvo ${year}. godine`);
    
    if (cup) {
        d3.select("#cup-info-stats").html(`
            <div style="display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; width: 100%; padding: 10px 0;">
                
                <!-- Prvi red: Glavni podaci o prvenstvu (Veća, uočljivija slova koja popunjavaju prostor) -->
                <p style="margin: 0; font-size: 16px; letter-spacing: 0.3px; width: 100%; text-align: center; color: #1a202c;">
                    📍 <b>Domaćin:</b> <span style="font-weight: 600;">${displayHost}</span> &nbsp;&nbsp;•&nbsp;&nbsp; 
                    🏆 <b>Prvak svijeta:</b> <span style="font-weight: 600; color: #2b6cb0;">${displayWinner}</span> &nbsp;&nbsp;•&nbsp;&nbsp; 
                    ⚽ <b>Ukupno golova:</b> <span style="font-weight: 600;">${cup.GoalsScored}</span> &nbsp;&nbsp;•&nbsp;&nbsp; 
                    🏟️ <b>Odigrano mečeva:</b> <span style="font-weight: 600;">${cup.MatchesPlayed || 64}</span>
                </p>
                
                <!-- Drugi red: Nagrade za igrače (Centrirano, s jasnim odvajanjem i elegantnim bedževima) -->
                <div style="display: flex; gap: 16px; justify-content: center; align-items: center; width: 100%; flex-wrap: wrap;">
                    <span style="padding: 6px 16px; background: #fffaf0; border-radius: 20px; border: 1px solid #fbd38d; font-size: 14px; color: #2d3748; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        👟 <b>Najbolji strijelac:</b> <span style="color: #dd6b20; font-weight: bold;">${topScorer}</span>
                    </span>
                    
                    ${bestPlayer !== "Not awarded" && bestPlayer.trim() !== "" ? `
                    <span style="padding: 6px 16px; background: #ebf8ff; border-radius: 20px; border: 1px solid #90cdf4; font-size: 14px; color: #2d3748; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        ⭐ <b>Zlatna lopta:</b> <span style="color: #2b6cb0; font-weight: bold;">${bestPlayer}</span>
                    </span>` : ''}
                </div>
                
            </div>
        `);
    }
    renderKnockoutBracket(year);
    updateTeamDropdownUniversal(year);
    let activeTeam = d3.select("#team-select").property("value");
    renderUniversalDashboard(activeTeam, year);
    
}

// =======================================================
// 5. UNIVERZALNI DASHBOARD S 4 GRAFIKONA ZA REPREZENTACIJE
// =======================================================
function renderUniversalDashboard(selectedTeam, year) {
    let profileData = [];
    let isAdvanced = (year === 2018 || year === 2022);

    if (year === 2022) {
        profileData = globalFifa2022Data.filter(d => d.Team1 === selectedTeam || d.Team2 === selectedTeam).map(m => {
            let isTeam1 = (m.Team1 === selectedTeam);
            return {
                Label: `vs ${isTeam1 ? m.Team2 : m.Team1} (${m.Category})`,
                GoalsFor: isTeam1 ? m.Goals1 : m.Goals2, GoalsAgainst: isTeam1 ? m.Goals2 : m.Goals1,
                Param2: isTeam1 ? m.Possession1 : m.Possession2, 
                Param3_1: isTeam1 ? m.Attempts1 : m.Attempts2, Param3_2: isTeam1 ? m.OnTarget1 : m.OnTarget2, 
                Param4_1: isTeam1 ? m.Fouls1 : m.Fouls2, Param4_2: isTeam1 ? m.Yellow1 : m.Yellow2 
            };
        });
    } else if (year === 2018) {
        profileData = globalFifa2018Data.filter(d => d.Team === selectedTeam).map(m => {
            return {
                Label: m.Label, GoalsFor: m.GoalsFor, GoalsAgainst: m.GoalsAgainst,
                Param2: m.Possession, Param3_1: m.Attempts, Param3_2: m.OnTarget,
                Param4_1: m.Fouls, Param4_2: m.YellowCards
            };
        });
    } else {
        profileData = globalMatchesData.filter(m => m.Year === year && (m["Home Team Name"] === selectedTeam || m["Away Team Name"] === selectedTeam)).map(m => {
            let isHome = (m["Home Team Name"] === selectedTeam);
            let rawStage = m.Stage ? m.Stage.split(' ')[0] : "Match";
            return {
                Label: `vs ${isHome ? m["Away Team Name"] : m["Home Team Name"]} (${rawStage})`,
                GoalsFor: isHome ? +m["Home Team Goals"] : +m["Away Team Goals"],
                GoalsAgainst: isHome ? +m["Away Team Goals"] : +m["Home Team Goals"],
                Param2: +m.Attendance, 
                Param3_1: isHome ? +m["Half-time Home Goals"] : +m["Half-time Away Goals"], 
                Param3_2: isHome ? +m["Half-time Away Goals"] : +m["Half-time Home Goals"],
                Param4_1: (+m["Home Team Goals"] + +m["Away Team Goals"]), 
                Param4_2: +m.Attendance 
            };
        });
    }

    d3.select("#chart1").html(""); d3.select("#chart2").html(""); d3.select("#chart3").html(""); d3.select("#chart4").html("");
    const localWidth = width;

    // --- GRAFIKON 1 ---
    d3.select("#chart1-title").text(`Grafikon 1: Golovi reprezentacije ${selectedTeam} kroz turnir`);
    const svg1 = d3.select("#chart1").append("svg").attr("width", localWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x1 = d3.scaleBand().domain(profileData.map(d => d.Label)).range([0, localWidth]).padding(0.3);
    const y1 = d3.scaleLinear().domain([0, d3.max(profileData, d => Math.max(d.GoalsFor, d.GoalsAgainst)) + 1 || 5]).range([height, 0]);
    const xSubGroup = d3.scaleBand().domain(['For', 'Against']).range([0, x1.bandwidth()]).padding(0.05);
    
    svg1.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg1.append("g").call(d3.axisLeft(y1).ticks(5));
    svg1.selectAll(".bar-for").data(profileData).enter().append("rect").attr("class", "bar-goals-for").attr("x", d => x1(d.Label) + xSubGroup('For')).attr("y", d => y1(d.GoalsFor)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsFor));
    svg1.selectAll(".bar-against").data(profileData).enter().append("rect").attr("class", "bar-goals-against").attr("x", d => x1(d.Label) + xSubGroup('Against')).attr("y", d => y1(d.GoalsAgainst)).attr("width", xSubGroup.bandwidth()).attr("height", d => height - y1(d.GoalsAgainst));

    // --- GRAFIKON 2 ---
    d3.select("#chart2-title").text(isAdvanced ? `Grafikon 2: Kretanje posjeda lopte (%)` : `Grafikon 2: Gledanost utakmica na stadionima`);
    const svg2 = d3.select("#chart2").append("svg").attr("width", localWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const y2 = d3.scaleLinear().domain(isAdvanced ? [0, 100] : [0, d3.max(profileData, d => d.Param2) * 1.1 || 100000]).range([height, 0]);
    
    svg2.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg2.append("g").call(d3.axisLeft(y2).tickFormat(d => isAdvanced ? d + "%" : d.toLocaleString()));
    const lineGen = d3.line().x(d => x1(d.Label) + x1.bandwidth()/2).y(d => y2(d.Param2));
    svg2.append("path").datum(profileData).attr("class", "line-possession").attr("d", lineGen);
    svg2.selectAll(".dot-possession").data(profileData).enter().append("circle").attr("class", "dot-possession").attr("cx", d => x1(d.Label) + x1.bandwidth()/2).attr("cy", d => y2(d.Param2)).attr("r", 6)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(isAdvanced ? `<b>Posjed:</b> ${d.Param2}%` : `<b>Gledatelja:</b> ${d.Param2.toLocaleString()}`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));

    // --- GRAFIKON 3 ---
    d3.select("#chart3-title").text(isAdvanced ? `Grafikon 3: Odnos ukupnih udaraca i udaraca u okvir` : `Grafikon 3: Postignuti (Plavo) vs primljeni golovi na poluvremenu (Crveno)`);
    const svg3 = d3.select("#chart3").append("svg").attr("width", localWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const y3 = d3.scaleLinear().domain([0, d3.max(profileData, d => Math.max(d.Param3_1, d.Param3_2)) + 2 || 10]).range([height, 0]);
    const xSubGroup3 = d3.scaleBand().domain(['T1', 'T2']).range([0, x1.bandwidth()]).padding(0.05);
    
    svg3.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x1)).selectAll("text").style("text-anchor", "end").attr("transform", "rotate(-15)");
    svg3.append("g").call(d3.axisLeft(y3).ticks(5));
    svg3.selectAll(".bar-p31").data(profileData).enter().append("rect").attr("class", isAdvanced ? "bar-attempts-total" : "bar-goals-for").attr("x", d => x1(d.Label) + xSubGroup3('T1')).attr("y", d => y3(d.Param3_1)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.Param3_1));
    svg3.selectAll(".bar-p32").data(profileData).enter().append("rect").attr("class", isAdvanced ? "bar-attempts-target" : "bar-goals-against").attr("x", d => x1(d.Label) + xSubGroup3('T2')).attr("y", d => y3(d.Param3_2)).attr("width", xSubGroup3.bandwidth()).attr("height", d => height - y3(d.Param3_2));

    // --- GRAFIKON 4 ---
    d3.select("#chart4-title").text(isAdvanced ? `Grafikon 4: Disciplina - Odnos prekršaja i žutih kartona` : `Grafikon 4: Odnos ukupnog broja golova na utakmici (X) i gledanosti (Y)`);
    const svg4 = d3.select("#chart4").append("svg").attr("width", localWidth + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Param4_1) + 2 || 15]).range([0, localWidth]);
    const y4 = d3.scaleLinear().domain([0, d3.max(profileData, d => d.Param4_2) * 1.1 || 10]).range([height, 0]);
    
    svg4.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x4));
    svg4.append("g").call(d3.axisLeft(y4).tickFormat(d => isAdvanced ? d : d.toLocaleString()));
    svg4.selectAll(".dot-discipline").data(profileData).enter().append("circle").attr("class", "dot-discipline").attr("cx", d => x4(d.Param4_1)).attr("cy", d => y4(d.Param4_2)).attr("r", 7)
        .on("mouseover", function(event, d) { d3.select("#tooltip").style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 10) + "px").select("#tooltip-value").html(isAdvanced ? `<b>Utakmica:</b> ${d.Label}<br><b>Prekršaji:</b> ${d.Param4_1}<br><b>Kartoni:</b> ${d.Param4_2}` : `<b>Utakmica:</b> ${d.Label}<br><b>Golova na meču:</b> ${d.Param4_1}<br><b>Gledatelja:</b> ${d.Param4_2.toLocaleString()}`); d3.select("#tooltip").classed("hidden", false); })
        .on("mouseout", () => d3.select("#tooltip").classed("hidden", true));
}

// =======================================================
// 6. DINAMIČKO GENERIRANJE TOURNAMENT BRACKETA
// =======================================================
function renderKnockoutBracket(year) {
    const container = d3.select("#knockout-container");
    container.html("");

    let stages = ["Round of 16", "Quarter-finals", "Semi-finals", "Final"];
    let displayStages = ["Osmina finala", "Četvrtfinale", "Polufinale", "Finale"];

    let knockoutMatches = [];
    if (year === 2022) {
        knockoutMatches = globalFifa2022Data.filter(m => ["Round of 16", "Quarter-finals", "Semi-finals", "Final"].includes(m.Category)).map(m => ({
            Stage: m.Category, T1: m.Team1, T2: m.Team2, S1: m.Goals1, S2: m.Goals2
        }));
    } else if (year === 2018) {
        knockoutMatches = globalFifa2018Data.filter(m => ["Round of 16", "Quarter-finals", "Semi-finals", "Final"].includes(m.Stage)).map(m => ({
            Stage: m.Stage, T1: m.Team, T2: m.Opponent, S1: m.GoalsFor, S2: m.GoalsAgainst
        }));
        let filtered18 = [];
        let checkedKeys = new Set();
        knockoutMatches.forEach(m => {
            let key = [m.Stage, m.T1, m.T2].sort().join("|");
            if (!checkedKeys.has(key)) { checkedKeys.add(key); filtered18.push(m); }
        });
        knockoutMatches = filtered18;
    } else {
        knockoutMatches = globalMatchesData.filter(m => m.Year === year && ["Round of 16", "Quarter-finals", "Semi-finals", "Final"].includes(m.Stage)).map(m => ({
            Stage: m.Stage, T1: m["Home Team Name"], T2: m["Away Team Name"], S1: +m["Home Team Goals"], S2: +m["Away Team Goals"]
        }));
    }

    stages.forEach((stage, index) => {
        let stageMatches = knockoutMatches.filter(m => m.Stage === stage);
        if(stageMatches.length === 0 && stage === "Round of 16") return; 

        let column = container.append("div").attr("class", "bracket-column");
        column.append("div").attr("class", "bracket-stage-title").text(displayStages[index]);

        stageMatches.forEach(m => {
            let matchBox = column.append("div").attr("class", "match-box");
            let isT1Winner = m.S1 > m.S2;
            let isT2Winner = m.S2 > m.S1;

            let row1 = matchBox.append("div").attr("class", "team-row");
            row1.append("span").attr("class", `team-name ${isT1Winner ? "winner-highlight" : ""}`).text(m.T1);
            row1.append("span").attr("class", `team-score ${isT1Winner ? "winner-highlight" : ""}`).text(m.S1);

            let row2 = matchBox.append("div").attr("class", "team-row");
            row2.append("span").attr("class", `team-name ${isT2Winner ? "winner-highlight" : ""}`).text(m.T2);
            row2.append("span").attr("class", `team-score ${isT2Winner ? "winner-highlight" : ""}`).text(m.S2);
        });
    });
}