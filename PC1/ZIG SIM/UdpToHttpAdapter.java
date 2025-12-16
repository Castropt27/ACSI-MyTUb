import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.OutputStream;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;

/**
 * UDP to HTTP Adapter for ZIG SIM
 * ================================
 * Recebe dados do sensor via UDP (porta 5000) do ZIG SIM app
 * e encaminha via HTTP POST para o sensor-gateway service.
 */
public class UdpToHttpAdapter {
    
    private static final String UDP_HOST = "0.0.0.0";
    private static final int UDP_PORT = 5000;
    private static final String HTTP_GATEWAY_URL = "http://localhost:8000/";
    
    private static final Gson gson = new Gson();
    private static final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss");
    
    private static Boolean lastState = null;
    private static int messageCount = 0;
    
    /**
     * Envia dados via HTTP POST para o gateway
     */
    private static void forwardToGateway(String jsonData) {
        try {
            URL url = new URL(HTTP_GATEWAY_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            
            // Enviar dados
            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = jsonData.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }
            
            // Verificar resposta
            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                System.err.println("[WARN] Gateway returned status " + responseCode);
            }
            
            conn.disconnect();
            
        } catch (ConnectException e) {
            System.err.println("[ERROR] Could not connect to gateway. Is Docker running?");
            System.err.println("   Tried to connect to: " + HTTP_GATEWAY_URL);
        } catch (SocketTimeoutException e) {
            System.err.println("[ERROR] Gateway timeout (>5s)");
        } catch (Exception e) {
            System.err.println("[ERROR] HTTP error: " + e.getMessage());
        }
    }
    
    /**
     * Processa dados recebidos via UDP
     */
    private static void processData(String rawData) {
        try {
            // Parse JSON
            JsonObject jsonData = JsonParser.parseString(rawData).getAsJsonObject();
            
            // Extrair estado do sensor
            try {
                boolean currentState = jsonData
                    .getAsJsonObject("sensordata")
                    .getAsJsonObject("proximitymonitor")
                    .get("proximitymonitor")
                    .getAsBoolean();
                
                // Apenas logar se o estado mudou
                if (lastState == null || currentState != lastState) {
                    String timestamp = timeFormat.format(new Date());
                    if (currentState) {
                        System.out.println("[" + timestamp + "] SENSOR ATIVADO - Lugar Ocupado!");
                    } else {
                        System.out.println("[" + timestamp + "] SENSOR LIVRE - Lugar Livre!");
                    }
                    lastState = currentState;
                }
                
            } catch (Exception e) {
                System.err.println("[WARN] JSON sem campo de sensor esperado");
            }
            
            // Encaminhar para gateway HTTP (sempre, mesmo se estado nao mudou)
            forwardToGateway(rawData);
            
        } catch (Exception e) {
            System.err.println("[WARN] JSON invalido: " + e.getMessage());
            System.err.println("Raw data nao sera encaminhado");
        }
    }
    
    /**
     * Loop principal do servidor UDP
     */
    public static void main(String[] args) {
        System.out.println("============================================================");
        System.out.println("Starting UDP to HTTP Adapter for ZIG SIM (Java)");
        System.out.println("============================================================");
        
        try (DatagramSocket socket = new DatagramSocket(UDP_PORT, InetAddress.getByName(UDP_HOST))) {
            System.out.println("[OK] UDP Adapter ready! Listening on port " + UDP_PORT);
            System.out.println("[->] Will forward to: " + HTTP_GATEWAY_URL);
            System.out.println("Waiting for ZIG SIM data...");
            System.out.println("Modo: Apenas mostrar mudancas de estado\n");
            
            byte[] buffer = new byte[4096];
            
            while (true) {
                try {
                    // Receber dados UDP
                    DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                    socket.receive(packet);
                    
                    messageCount++;
                    
                    // Decodificar dados
                    String rawData = new String(
                        packet.getData(), 
                        0, 
                        packet.getLength(), 
                        StandardCharsets.UTF_8
                    );
                    
                    // Processar dados
                    processData(rawData);
                    
                } catch (Exception e) {
                    System.err.println("[ERROR] Erro inesperado: " + e.getMessage());
                }
            }
            
        } catch (BindException e) {
            System.err.println("[ERROR] Porta " + UDP_PORT + " ja esta em uso!");
            System.err.println("   Verifique se outro adapter esta rodando.");
        } catch (Exception e) {
            System.err.println("[ERROR] Erro fatal: " + e.getMessage());
            e.printStackTrace();
        }
        
        System.out.println("\nAdapter stopped");
    }
}
