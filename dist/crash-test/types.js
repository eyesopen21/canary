/**
 * Shared types for the isolated crash test (CAN-F-07, ADR-0004).
 *
 * Nothing in this module holds a real credential, a host taken from a
 * credential, or an absolute path. Reports use fixed strings only.
 */
                                                                                    

                                                              

/** Prefix used for the OS temporary directory created by each crash test. */
export const TEMP_PREFIX = "canary-crash-";

                                                                   

/**
 * Fixed reason codes. A guard failure NEVER reports a caught error message:
 * those messages can contain paths or environment values (CAN-N-10).
 */
                              
            
                        
                           
                             
                         
                    
                                
                            
                                  
                    

                                                                 

                              
               
                 
              
                                          
                    
 

                                 
              
                                                                             
                  
                                                                    
                        
                                                                               
                                         
 

                                                                  

                              
                     
                    
                            
                 
                            
                             
 

                                 
                      
                
                                                                         
                  
                             
                                                                                     
 

                                  
                    
                              
                                        
                                                 
 

/** Test-only observability hooks. They are not part of the printed report. */
                                   
                                                                               
                        
                                                                             
                                
                                                                            
                            
                                                                           
                                                             
                                                                          
                                      
                                                                         
                                                               
                                                                      
                        
                        
                              
                                                            
            
 
