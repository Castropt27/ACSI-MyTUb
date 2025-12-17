import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

/**
 * Test UDP Sender - Simula o ZIG SIM enviando dados
 */
public class TestUdpSender {

    private static final String UDP_HOST = "localhost";
    private static final int UDP_PORT = 5000;
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    /**
     * Envia dados de teste via UDP
     */
    public static void sendTestData(boolean ocupado) throws IOException {
        // Criar timestamp no formato do ZIG SIM
        Date now = new Date();
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy_MM_dd_HH:mm:ss.SSS");
        String timestamp = dateFormat.format(now);

        // Construir dados de teste (mesmo formato do ZIG SIM)
        Map<String, Object> data = new HashMap<>();

        // Device info
        Map<String, Object> device = new HashMap<>();
        device.put("name", "Test Device (Java)");
        device.put("displayheight", 2208);
        device.put("uuid", "TEST123ABC");
        device.put("os", "java");
        device.put("osversion", System.getProperty("java.version"));
        device.put("displaywidth", 1242);
        data.put("device", device);

        // Timestamp
        data.put("timestamp", timestamp);

        // Sensor data
        Map<String, Object> sensordata = new HashMap<>();

        Map<String, Object> proximitymonitor = new HashMap<>();
        proximitymonitor.put("proximitymonitor", ocupado);
        sensordata.put("proximitymonitor", proximitymonitor);

        Map<String, Object> location = new HashMap<>();
        location.put("latitude", 41.55387812968043);
        location.put("longitude", -8.427430784131518);

        sensordata.put("location", location);

        data.put("sensordata", sensordata);

        // Metadata
        data.put("rua", "Praca do Comercio");
        data.put("zone", "A1");

        // Converter para JSON
        String jsonMessage = gson.toJson(data);

        // Enviar via UDP
        try (DatagramSocket socket = new DatagramSocket()) {
            byte[] buffer = jsonMessage.getBytes("UTF-8");
            InetAddress address = InetAddress.getByName(UDP_HOST);
            DatagramPacket packet = new DatagramPacket(buffer, buffer.length, address, UDP_PORT);

            System.out.println("============================================================");
            System.out.println("[->] Enviando dados via UDP para " + UDP_HOST + ":" + UDP_PORT);
            System.out.println("[i] Ocupado: " + ocupado);
            System.out.println("[i] Timestamp: " + timestamp);
            System.out.println("============================================================");
            System.out.println(jsonMessage);
            System.out.println("============================================================");

            socket.send(packet);
            System.out.println("[OK] Enviado!");
        }
    }

    public static void main(String[] args) {
        System.out.println("\nTEST UDP SENDER - Simulador ZIG SIM (Java)\n");

        Scanner scanner = new Scanner(System.in);

        while (true) {
            try {
                System.out.println("\nEscolhe uma opcao:");
                System.out.println("1 - Enviar 'ocupado=true'");
                System.out.println("2 - Enviar 'ocupado=false'");
                System.out.println("3 - Enviar 5 mensagens alternadas (true/false)");
                System.out.println("0 - Sair");
                System.out.print("\nOpcao: ");

                String choice = scanner.nextLine().trim();

                switch (choice) {
                    case "1":
                        sendTestData(true);
                        break;

                    case "2":
                        sendTestData(false);
                        break;

                    case "3":
                        for (int i = 0; i < 5; i++) {
                            sendTestData(i % 2 == 0);
                            System.out.println("\n[...] Aguardando 2 segundos...\n");
                            Thread.sleep(2000);
                        }
                        System.out.println("\n[OK] 5 mensagens enviadas!");
                        break;

                    case "0":
                        System.out.println("\nAdeus!");
                        scanner.close();
                        return;

                    default:
                        System.out.println("[ERROR] Opcao invalida!");
                }

            } catch (Exception e) {
                System.err.println("[ERROR] Erro: " + e.getMessage());
                e.printStackTrace();
            }
        }
    }
}
