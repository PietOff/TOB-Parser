import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Circle, LayersControl, useMap, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { wgs84ToRd } from '../utils/apiIntegrations';

// Component to auto-fit map bounds
function FitBounds({ center, radius }) {
    const map = useMap();
    useEffect(() => {
        if (center && Array.isArray(center) && !isNaN(center[0]) && !isNaN(center[1])) {
            if (radius) {
                // Create bounds around the center point with buffer
                const radiusKm = radius / 1000;
                const bounds = L.latLngBounds(
                    [center[0] - radiusKm / 111, center[1] - radiusKm / 111],
                    [center[0] + radiusKm / 111, center[1] + radiusKm / 111]
                );
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            } else {
                map.setView(center, 14);
            }
        }
    }, [center, radius, map]);
    return null;
}

// Component to handle drawing and edit interactions
function DrawingControl({ onDrawnGeometry }) {
    const featureGroupRef = useRef(null);

    const handleCreated = (e) => {
        const { layer } = e;
        const geoJSON = layer.toGeoJSON();
        console.log('✏️ [Drawing] Created geometry:', geoJSON);
        onDrawnGeometry?.(geoJSON);
    };

    const handleEdited = (e) => {
        const layers = e.layers;
        layers.eachLayer((layer) => {
            const geoJSON = layer.toGeoJSON();
            console.log('✏️ [Drawing] Edited geometry:', geoJSON);
            onDrawnGeometry?.(geoJSON);
        });
    };

    return (
        <FeatureGroup ref={featureGroupRef}>
            <EditControl
                position="topleft"
                onCreated={handleCreated}
                onEdited={handleEdited}
                draw={{
                    rectangle: false,
                    polyline: false,
                    marker: false,
                    circle: {
                        shapeOptions: {
                            color: '#ff4444',
                            fillColor: '#ff4444',
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5',
                        }
                    },
                    polygon: {
                        shapeOptions: {
                            color: '#ff4444',
                            fillColor: '#ff4444',
                            fillOpacity: 0.15,
                            weight: 2,
                            dashArray: '5, 5',
                        }
                    },
                    circlemarker: false,
                }}
            />
        </FeatureGroup>
    );
}

/**
 * LocationMap — Interactive map showing project trace area
 * Shows extracted or manually drawn project area around primary address
 */
export default function LocationMap({
    locations = [],
    height = '400px',
    onLocationDrag,
    highlightedLocationCode,
    projectAddress,
    projectTrace
}) {
    const [mapCenter, setMapCenter] = useState(null);
    const [bufferRadius, setBufferRadius] = useState(500); // Default 500m buffer
    const [isLoading, setIsLoading] = useState(true);
    const [manualGeometry, setManualGeometry] = useState(null);

    console.log(`🗺️ [Map] Project Address:`, projectAddress);
    console.log(`🗺️ [Map] Project Trace:`, projectTrace);
    console.log(`✏️ [Map] Manual Geometry:`, manualGeometry);

    // Geocode the project address to get map center
    useEffect(() => {
        async function geocodeAddress() {
            if (!projectAddress) {
                setIsLoading(false);
                return;
            }

            try {
                const query = `${projectAddress.straatnaam} ${projectAddress.huisnummer}, ${projectAddress.postcode || projectAddress.city}, Netherlands`;
                console.log(`🔍 [Map] Geocoding: ${query}`);

                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
                );
                const results = await response.json();

                if (results.length > 0) {
                    const first = results[0];
                    const center = [parseFloat(first.lat), parseFloat(first.lon)];
                    setMapCenter(center);
                    console.log(`✅ [Map] Geocoded to:`, center);

                    // Calculate buffer radius from trace distance if available
                    if (projectTrace?.distance) {
                        const radiusM = projectTrace.unit === 'km'
                            ? projectTrace.distance * 1000
                            : projectTrace.distance;
                        setBufferRadius(radiusM);
                        console.log(`📏 [Map] Buffer radius set to: ${radiusM}m`);
                    }
                } else {
                    console.warn(`⚠️ [Map] Could not geocode address:`, query);
                    setMapCenter(null);
                }
            } catch (err) {
                console.warn('Geocoding failed:', err);
                setMapCenter(null);
            } finally {
                setIsLoading(false);
            }
        }

        geocodeAddress();
    }, [projectAddress, projectTrace]);

    // Default center (Utrecht, Netherlands)
    const defaultCenter = [52.0907, 5.1214];
    const center = mapCenter || defaultCenter;
    const isDefaulting = !mapCenter;

    if (isLoading) {
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
                    <div>Kaart laden...</div>
                </div>
            </div>
        );
    }

    if (!mapCenter && !projectAddress) {
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
                    <div>Geen projectlocatie gevonden</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een TOB document met adresgegevens</div>
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
                zoom={isDefaulting ? 8 : 14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <FitBounds center={center} radius={bufferRadius} />
                <DrawingControl onDrawnGeometry={setManualGeometry} />

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

                    <LayersControl.Overlay checked name="📐 Kadastrale Percelen (BRK)">
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

                {/* Project area buffer circle */}
                {mapCenter && (
                    <Circle
                        center={mapCenter}
                        radius={bufferRadius}
                        pathOptions={{
                            color: '#1976d2',
                            weight: 3,
                            opacity: 0.6,
                            fillColor: '#1976d2',
                            fillOpacity: 0.1,
                            dashArray: '5, 5',
                        }}
                    />
                )}
            </MapContainer>

            {/* Map legend and info overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                maxWidth: '300px',
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📍 Projectlocatie:</div>
                {projectAddress && (
                    <div style={{ marginBottom: '6px', fontSize: '11px' }}>
                        <div><strong>{projectAddress.straatnaam} {projectAddress.huisnummer}</strong></div>
                        <div>{projectAddress.postcode} {projectAddress.city}</div>
                    </div>
                )}
                {(projectTrace || manualGeometry) && (
                    <div style={{ marginBottom: '6px', fontSize: '11px', borderTop: '1px solid #555', paddingTop: '6px' }}>
                        {projectTrace && !manualGeometry && (
                            <>
                                <div style={{ color: '#4da6ff' }}>🔵 <strong>Auto-gedetecteerd</strong></div>
                                <div><strong>Tracé:</strong> {projectTrace.description}</div>
                                {projectTrace.distance && (
                                    <div>Buffer: {projectTrace.distance} {projectTrace.unit}</div>
                                )}
                            </>
                        )}
                        {manualGeometry && (
                            <>
                                <div style={{ color: '#ff8888' }}>🔴 <strong>Handmatig getekend</strong></div>
                                <div>Type: {manualGeometry.geometry.type}</div>
                            </>
                        )}
                    </div>
                )}
                <div style={{ fontSize: '10px', opacity: 0.8, borderTop: '1px solid #555', paddingTop: '6px', marginTop: '6px' }}>
                    💡 Gebruik de tekentools (linksboven) om het onderzoeksgebied te definiëren
                    <br />💡 Toggle 'Kadastrale Percelen' om erfpachten te zien
                </div>
            </div>
        </div>
    );
}
