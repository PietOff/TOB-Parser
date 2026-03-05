import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { rdToWgs84 } from '../utils/apiIntegrations';

// Fix default marker icons (Leaflet + bundler issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Red icon for certainly contaminated
const contaminatedIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #ff4444, #cc0000);
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// Orange icon for potentially contaminated (verdacht)
const suspiciousIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #ffa500, #ff8c00);
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// Green icon for clean sites
const cleanIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 20px; height: 20px;
        background: linear-gradient(135deg, #44cc44, #228822);
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// Component to auto-fit map bounds
function FitBounds({ positions }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length > 0) {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [positions, map]);
    return null;
}

// Component to auto-pan to a specific marker when selected in the table
function AutoPan({ highlightedCode, markers }) {
    const map = useMap();
    useEffect(() => {
        if (highlightedCode) {
            const m = markers.find(mark => mark.locatiecode === highlightedCode);
            if (m && m.lat && m.lon) {
                map.flyTo([m.lat, m.lon], 17, { animate: true, duration: 1.5 });
            }
        }
    }, [highlightedCode, markers, map]);
    return null;
}

/**
 * LocationMap — Interactive map showing TOB locations
 * with PDOK background layers and Bodemkwaliteitskaart WMS overlay
 */
export default function LocationMap({ locations = [], height = '400px', onLocationDrag, highlightedLocationCode }) {
    const [activeLocation, setActiveLocation] = useState(null);

    console.log(`🗺️ [Map] Received ${locations.length} locations.`);
    if (locations.length > 0) {
        console.debug('First location detailed:', locations[0]);
    }

    // Convert locations to map markers
    const markers = locations
        .filter(loc => {
            // Need either enriched coords or RD coords
            return (loc._enriched?.rd?.x && loc._enriched?.rd?.y) ||
                (loc._enriched?.lat && loc._enriched?.lon);
        })
        .map(loc => {
            let lat, lon;
            if (loc._enriched?.lat && loc._enriched?.lon) {
                lat = loc._enriched.lat;
                lon = loc._enriched.lon;
            } else {
                // Use the corrected rdToWgs84 function with the right object path
                const coords = rdToWgs84(loc._enriched.rd.x, loc._enriched.rd.y);
                lat = coords.lat;
                lon = coords.lng;
            }
            return {
                ...loc,
                lat, lon,
                conclusie: loc.conclusie || 'onverdacht',
            };
        });

    console.log(`📍 [Map] Generated ${markers.length} markers.`);

    // Default center (Utrecht, Netherlands)
    const defaultCenter = [52.0907, 5.1214];
    const center = markers.length > 0
        ? [markers[0].lat, markers[0].lon]
        : defaultCenter;
    const positions = markers.map(m => [m.lat, m.lon]);

    if (markers.length === 0) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Geen coördinaten beschikbaar</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een bestand met adresgegevens</div>
                </div>
            </div>
        );
    }

    return (
        <div id="master-location-map" style={{
            height,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            position: 'relative',
        }}>
            <MapContainer
                center={center}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <FitBounds positions={positions} />
                <AutoPan highlightedCode={highlightedLocationCode} markers={markers} />

                <LayersControl position="topright">
                    {/* Base layers */}
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK Luchtfoto">
                        <TileLayer
                            attribution='&copy; PDOK'
                            url="https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK BRT Achtergrond">
                        <TileLayer
                            attribution='&copy; Kadaster / PDOK'
                            url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    {/* Overlay layers */}
                    <LayersControl.Overlay name="🔴 Bodemkwaliteitskaart">
                        <WMSTileLayer
                            url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0"
                            layers="bodemkwaliteitskaart"
                            format="image/png"
                            transparent={true}
                            opacity={0.5}
                            attribution='&copy; PDOK Bodemkwaliteit'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="📐 Kadastrale Percelen (BRK)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0"
                            layers="Perceel"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; Kadaster'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="🏠 Gebouwcontouren (BAG)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/lvbag/bag/wms/v2_0"
                            layers="pand"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; BAG'
                        />
                    </LayersControl.Overlay>
                </LayersControl>

                {markers.map((marker, idx) => {
                    const conc = marker.conclusie.toLowerCase();
                    const icon = conc.includes('zeker') || conc.includes('vbo') ? contaminatedIcon :
                        conc.includes('verdacht') || conc.includes('onzeker') ? suspiciousIcon : cleanIcon;

                    return (
                        <Marker
                            key={marker.locatiecode || idx}
                            position={[marker.lat, marker.lon]}
                            icon={icon}
                            draggable={true}
                            eventHandlers={{
                                click: () => setActiveLocation(marker),
                                dragend: (e) => {
                                    const latLng = e.target.getLatLng();
                                    if (onLocationDrag && marker.locatiecode) {
                                        onLocationDrag(marker.locatiecode, latLng.lat, latLng.lng);
                                    }
                                }
                            }}
                        >
                            <Popup maxWidth={300}>
                                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                                    <div style={{
                                        fontWeight: 700,
                                        fontSize: '14px',
                                        borderBottom: '1px solid #eee',
                                        paddingBottom: '4px',
                                        marginBottom: '6px'
                                    }}>
                                        {marker.conclusie}
                                    </div>
                                    <div><b>Naam:</b> {marker.locatienaam || '—'}</div>
                                    <div><b>Adres:</b> {`${marker.straatnaam || ''} ${marker.huisnummer || ''}`.trim() || '—'}</div>
                                    {marker._enriched?.gemeente && (
                                        <div><b>Gemeente:</b> {marker._enriched.gemeente}</div>
                                    )}
                                    {marker._enriched?.bodemkwaliteit?.[0] && (
                                        <div><b>Bodemklasse:</b> {marker._enriched.bodemkwaliteit[0].klasse}</div>
                                    )}
                                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {marker._enriched?.topotijdreisHuidig && (
                                            <a href={marker._enriched.topotijdreisHuidig} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: '12px', color: '#1a73e8' }}>
                                                🕰️ Topotijdreis
                                            </a>
                                        )}
                                        {marker._enriched?.bodemloket && (
                                            <a href={marker._enriched.bodemloket} target="_blank" rel="noopener noreferrer"
                                                style={{ fontSize: '12px', color: '#1a73e8' }}>
                                                🔍 Bodemloket
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Map legend overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.75)',
                color: 'white',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                gap: '12px',
            }}>
                <span style={{ color: '#ff4444' }}>🔴 Verontreinigd</span>
                <span style={{ color: '#ffa500' }}>🟠 Verdacht</span>
                <span style={{ color: '#44cc44' }}>🟢 Onverdacht</span>
                <span style={{ opacity: 0.7 }}>Tip: Zet 'Kadastrale Percelen' aan voor contouren</span>
            </div>
        </div >
    );
}
