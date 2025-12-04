package com.exemplo.kafka.sensor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;

import java.time.Duration;
import java.util.Collections;
import java.util.Properties;

public class SensorConsumer {

    private static final String TOPIC = "sensor-estado";

    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "192.168.1.10:9092"); // mesmo broker
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "grupo-sensores");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest"); // ou "latest"
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");

        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(Collections.singletonList(TOPIC));

            System.out.println("A ouvir mensagens do tópico " + TOPIC + "...");

            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));

                for (ConsumerRecord<String, String> record : records) {
                    String json = record.value();

                    // Converte JSON para objeto
                    SensorEvent event = mapper.readValue(json, SensorEvent.class);

                    System.out.printf("Recebido: %s | partição=%d offset=%d%n",
                            event, record.partition(), record.offset());

                    // Aqui fazes a lógica de negócio:
                    // - gravar em BD
                    // - atualizar dashboard
                    // - acionar alerta, etc.
                }
            }
        }
    }
}